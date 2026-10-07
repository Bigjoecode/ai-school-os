import { CHECKIN_TYPE_LABELS, type CheckInQuestion, type CheckInQuestionType } from '@aischool/shared';
import { ArrowDown, ArrowUp, Check, Database, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { aiCheckIn, bankQuestions } from './api';

/** A question being edited (ids are kept so answers already given still match). */
export type DraftQ = CheckInQuestion;

let n = 0;
export const newId = () => `new${Date.now().toString(36)}${(n++).toString(36)}`;

export const blankQuestion = (type: CheckInQuestionType = 'MCQ', at: number | null = null): DraftQ => ({
  id: newId(),
  type,
  prompt: '',
  options: type === 'MCQ' ? ['', '', '', ''] : type === 'TRUE_FALSE' ? ['True', 'False'] : [],
  correctIndex: type === 'SHORT' ? null : 0,
  answers: [],
  explanation: null,
  at,
  source: 'TYPED',
  sourceId: null,
});

/** "1:30" ⇄ 90 */
export const toClock = (s: number | null) => (s === null ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
export function fromClock(v: string): number | null {
  const m = /^(\d{1,3})(?::(\d{1,2}))?$/.exec(v.trim());
  if (!m) return null;
  return m[2] !== undefined ? Number(m[1]) * 60 + Number(m[2]) : Number(m[1]);
}

/** Ready to send: blank options dropped (keeping the right answer's position right). */
export function cleanQuestion(q: DraftQ): DraftQ {
  if (q.type !== 'MCQ') return q;
  const kept = q.options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
  return { ...q, options: kept.map((x) => x.o), correctIndex: Math.max(0, kept.findIndex((x) => x.i === q.correctIndex)) };
}

export function QuestionsEditor({
  questions,
  onChange,
  video,
  context,
}: {
  questions: DraftQ[];
  onChange: (qs: DraftQ[]) => void;
  /** Video quiz: each question has a time. */
  video?: boolean;
  context: { subjectId: string; classLevelId: string; classArmId: string | null; topicId: string | null; topic: string | null; canAi: boolean };
}) {
  const [bankOpen, setBankOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const set = (i: number, q: DraftQ) => onChange(questions.map((x, j) => (j === i ? q : x)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...questions];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    onChange(next);
  };
  const lastAt = questions.reduce((t, q) => Math.max(t, q.at ?? 0), 0);
  const draftAi = () => {
    if (!context.topic) return toast.error('Give the module a topic first (Details)');
    setAiBusy(true);
    aiCheckIn({ subjectId: context.subjectId, classArmId: context.classArmId, classLevelId: context.classLevelId, topicId: context.topicId, topic: context.topic, count: video ? 3 : 4, forVideo: !!video })
      .then((qs) => {
        onChange([...questions, ...qs.map((q, i) => ({ ...q, id: newId(), at: video ? lastAt + 60 * (i + 1) : null }))]);
        toast.success(`Added ${qs.length} AI-drafted question${qs.length === 1 ? '' : 's'}`, { description: 'Check each one before you publish.' });
      })
      .catch((e: unknown) => toast.error(errorMessage(e)))
      .finally(() => setAiBusy(false));
  };

  return (
    <div className="space-y-3">
      {questions.map((q, i) => (
        <QuestionCard key={q.id} q={q} index={i} video={video} onChange={(x) => set(i, x)} onRemove={() => onChange(questions.filter((_, j) => j !== i))} onMove={(d) => move(i, d)} first={i === 0} last={i === questions.length - 1} />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...questions, blankQuestion('MCQ', video ? lastAt + 60 : null)])}>
          <Plus /> Add a question
        </Button>
        {!video && (
          <Button type="button" variant="outline" size="sm" onClick={() => setBankOpen(true)}>
            <Database /> From the question bank
          </Button>
        )}
        {context.canAi && (
          <Button type="button" variant="ai" size="sm" onClick={draftAi} loading={aiBusy}>
            {!aiBusy && <Sparkles />} Draft with AI
          </Button>
        )}
      </div>
      <BankDialog open={bankOpen} onOpenChange={setBankOpen} context={context} onAdd={(qs) => onChange([...questions, ...qs.map((q) => ({ ...q, id: newId() }))])} />
    </div>
  );
}

function QuestionCard({ q, index, video, onChange, onRemove, onMove, first, last }: { q: DraftQ; index: number; video?: boolean; onChange: (q: DraftQ) => void; onRemove: () => void; onMove: (d: -1 | 1) => void; first: boolean; last: boolean }) {
  const [clock, setClock] = useState(toClock(q.at));
  const setType = (type: CheckInQuestionType) => {
    if (type === q.type) return;
    const b = blankQuestion(type, q.at);
    onChange({ ...b, id: q.id, prompt: q.prompt, explanation: q.explanation, options: type === 'MCQ' && q.type === 'MCQ' ? q.options : b.options });
  };
  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-semibold">Q{index + 1}</span>
        <Select value={q.type} onValueChange={(v) => setType(v as CheckInQuestionType)}>
          <SelectTrigger className="h-8 w-[160px]" aria-label="Question type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(CHECKIN_TYPE_LABELS) as CheckInQuestionType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {CHECKIN_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {video && (
          <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
            Pause at
            <Input
              value={clock}
              onChange={(e) => {
                setClock(e.target.value);
                const s = fromClock(e.target.value);
                if (s !== null) onChange({ ...q, at: s });
              }}
              placeholder="1:30"
              className="h-8 w-20 font-mono"
              aria-label="Time in the video (minutes:seconds)"
              aria-invalid={fromClock(clock) === null}
            />
          </label>
        )}
        {q.source !== 'TYPED' && <Badge variant={q.source === 'AI' ? 'ai' : 'info'}>{q.source === 'AI' ? 'AI draft — check it' : q.source === 'BANK' ? 'Question bank' : 'Practice bank'}</Badge>}
        <span className="ml-auto flex gap-1">
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => onMove(-1)} disabled={first} aria-label="Move up">
            <ArrowUp />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => onMove(1)} disabled={last} aria-label="Move down">
            <ArrowDown />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove question">
            <Trash2 />
          </Button>
        </span>
      </div>
      <Textarea value={q.prompt} onChange={(e) => onChange({ ...q, prompt: e.target.value })} placeholder="The question" rows={2} aria-label={`Question ${index + 1}`} />
      {q.type === 'MCQ' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {q.options.map((o, j) => (
            <div key={j} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...q, correctIndex: j })}
                aria-pressed={q.correctIndex === j}
                aria-label={`Mark option ${'ABCDEF'[j]} correct`}
                className={cn('grid size-8 shrink-0 place-items-center rounded-full border text-[12px] font-semibold', q.correctIndex === j ? 'border-success bg-success text-white' : 'border-border bg-card')}
              >
                {q.correctIndex === j ? <Check className="size-4" /> : 'ABCDEF'[j]}
              </button>
              <Input value={o} onChange={(e) => onChange({ ...q, options: q.options.map((x, k) => (k === j ? e.target.value : x)) })} placeholder={`Option ${'ABCDEF'[j]}`} className="h-9" />
            </div>
          ))}
          {q.options.length < 6 && (
            <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={() => onChange({ ...q, options: [...q.options, ''] })}>
              <Plus /> Option
            </Button>
          )}
        </div>
      )}
      {q.type === 'TRUE_FALSE' && (
        <div className="flex gap-2">
          {['True', 'False'].map((t, j) => (
            <Button key={t} type="button" size="sm" variant={q.correctIndex === j ? 'brand' : 'outline'} onClick={() => onChange({ ...q, correctIndex: j })} aria-pressed={q.correctIndex === j}>
              {q.correctIndex === j && <Check />} {t}
            </Button>
          ))}
        </div>
      )}
      {q.type === 'SHORT' && (
        <Input value={q.answers.join(', ')} onChange={(e) => onChange({ ...q, answers: e.target.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 6) })} placeholder="Accepted answers, separated by commas (e.g. 5, five)" aria-label="Accepted answers" />
      )}
      <Input value={q.explanation ?? ''} onChange={(e) => onChange({ ...q, explanation: e.target.value || null })} placeholder="Why it’s right (shown after answering) — optional" className="h-9" aria-label="Explanation" />
    </div>
  );
}

function BankDialog({ open, onOpenChange, context, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; context: { subjectId: string; classLevelId: string; topicId: string | null }; onAdd: (qs: DraftQ[]) => void }) {
  const [items, setItems] = useState<DraftQ[] | null>(null);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const load = (q?: string) => {
    setBusy(true);
    bankQuestions({ subjectId: context.subjectId, classLevelId: context.classLevelId, topicId: q ? undefined : (context.topicId ?? undefined), q: q || undefined })
      .then((r) => {
        setItems(r);
        setPick(new Set());
      })
      .catch((e: unknown) => toast.error(errorMessage(e)))
      .finally(() => setBusy(false));
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o && !items) load();
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Questions from the bank</DialogTitle>
          <DialogDescription>Approved objective and short-answer questions for this subject and class, and published practice questions on the topic.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              load(search);
            }}
          >
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the bank (topic or words)" />
            <Button type="submit" variant="outline" loading={busy}>
              Search
            </Button>
          </form>
          {!items ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">Loading…</p>
          ) : !items.length ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">No matching questions. Try another search, type your own, or draft them with AI.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((q) => (
                <li key={q.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 hover:bg-muted/40">
                    <Checkbox checked={pick.has(q.id)} onCheckedChange={(c) => setPick((p) => { const n = new Set(p); if (c) n.add(q.id); else n.delete(q.id); return n; })} className="mt-0.5" />
                    <span className="min-w-0 text-[13.5px]">
                      <span className="block">{q.prompt}</span>
                      <span className="block text-[12px] text-muted-foreground">
                        {CHECKIN_TYPE_LABELS[q.type]} · Answer: {q.type === 'SHORT' ? q.answers.join(' / ') : q.options[q.correctIndex ?? 0]}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="brand"
            disabled={!pick.size}
            onClick={() => {
              onAdd((items ?? []).filter((q) => pick.has(q.id)));
              onOpenChange(false);
            }}
          >
            Add {pick.size || ''} question{pick.size === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
