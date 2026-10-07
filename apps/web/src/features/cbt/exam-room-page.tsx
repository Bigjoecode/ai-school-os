import { CBT_GRACE_SECONDS, type CbtRoom, type CbtRoomQuestion } from '@aischool/shared';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  CloudOff,
  Flag,
  KeyRound,
  LayoutGrid,
  Loader2,
  Maximize2,
  Send,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { cbtKeys, saveAnswers, submitExam, useExamRoom, useStartExam } from './api';
import { LETTERS, clock } from './ui';

type AnswerValue = number | string | null;

// Device backup of the attempt (answers not yet confirmed by the server, flags, position, focus count).
const store = {
  read<T>(key: string): T | null {
    try {
      const v = window.localStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  },
  write(key: string, value: unknown) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode or full: the server copy still counts */
    }
  },
  remove(key: string) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

interface Backup {
  answers: Record<string, AnswerValue>;
  pending: string[];
  flags: string[];
  pos: number;
  focusLosses: number;
}

const answered = (v: AnswerValue | undefined) => typeof v === 'number' || (typeof v === 'string' && v.trim().length > 0);

/**
 * The exam room: a focused, full-screen page outside the app chrome. The
 * server owns the clock and the answers; this page saves every change,
 * keeps a copy on the device while offline, and hands in at zero.
 */
export default function ExamRoomPage() {
  const { id = '' } = useParams();
  const q = useExamRoom(id);
  useDocumentTitle(q.data?.exam.title ?? 'Exam');
  const room = q.data;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {q.error && !room ? (
        <Centered>
          <Card className="w-full">
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          </Card>
          <BackLink />
        </Centered>
      ) : !room ? (
        <Centered>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </Centered>
      ) : !room.attempt ? (
        <Lobby room={room} />
      ) : room.attempt.status === 'IN_PROGRESS' ? (
        <Player key={room.attempt.id} room={room} receivedAt={q.dataUpdatedAt} />
      ) : (
        <Finished room={room} />
      )}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-stretch justify-center gap-4 px-4 py-8">{children}</main>;
}

function BackLink() {
  return (
    <Link to="/my-exams" className="inline-flex items-center gap-1 self-start text-[13px] text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-3.5" /> My exams
    </Link>
  );
}

// ------------------------------------------------------------------ lobby

function Lobby({ room }: { room: CbtRoom }) {
  const e = room.exam;
  const start = useStartExam(e.id);
  const [code, setCode] = useState('');
  const err = start.error;
  const codeError = err instanceof ApiError ? err.errors.find((x) => x.path === 'accessCode')?.message : undefined;
  return (
    <Centered>
      <BackLink />
      <Card className="p-5 sm:p-7">
        <Badge variant="brand">{e.subject}</Badge>
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight">{e.title}</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          {e.classLevel} · {e.questionCount} questions · {e.totalMarks} marks · {e.durationMinutes} minutes
        </p>
        {e.instructions && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-muted/60 px-4 py-3 text-[14px]">{e.instructions}</p>}
        <ul className="mt-4 space-y-2 text-[13.5px]">
          <li className="flex gap-2">
            <Clock className="mt-0.5 size-4 shrink-0 text-brand" /> The timer starts when you press Start and keeps running even if you close the page. It must end by {formatDateTime(e.closesAt)}.
          </li>
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" /> Every answer saves as you go. If the network drops or the page reloads, open the exam again and carry on.
          </li>
          <li className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> Stay on this screen. Each time you switch to another app or tab is recorded for your teacher.
          </li>
          <li className="flex gap-2">
            <Send className="mt-0.5 size-4 shrink-0 text-brand" /> You have one attempt. When time runs out, your answers are handed in automatically.
          </li>
        </ul>
        {e.phase === 'OPEN' ? (
          <form
            className="mt-6 space-y-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              start.mutate(e.needsAccessCode ? code.trim() : null);
            }}
          >
            {e.needsAccessCode && (
              <Field label="Access code" htmlFor="cbt-code" error={codeError} hint="Your invigilator will give you this code.">
                <Input id="cbt-code" value={code} onChange={(x) => setCode(x.target.value.toUpperCase())} autoComplete="off" autoCapitalize="characters" invalid={!!codeError} className="h-11 font-mono text-base tracking-widest" />
              </Field>
            )}
            {err && !codeError && (
              <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
                {errorMessage(err)}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" loading={start.isPending} disabled={e.needsAccessCode && !code.trim()}>
              {e.needsAccessCode ? <KeyRound /> : null} Start the exam
            </Button>
          </form>
        ) : (
          <p className="mt-6 rounded-xl bg-muted px-4 py-3 text-center text-[14px] font-medium">{e.phase === 'UPCOMING' || e.phase === 'DRAFT' ? 'This exam has not opened yet.' : 'This exam has closed.'}</p>
        )}
      </Card>
    </Centered>
  );
}

// ------------------------------------------------------------------ player

type SaveState = 'saved' | 'saving' | 'offline' | 'error';

function Player({ room, receivedAt }: { room: CbtRoom; receivedAt: number }) {
  const attempt = room.attempt!;
  const examId = room.exam.id;
  const key = `cbt:${attempt.id}`;
  const questions = attempt.questions;
  const backup = useMemo(() => store.read<Backup>(key), [key]);

  // Server answers, with anything this device changed but the server hasn't confirmed on top.
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(() => {
    const merged = { ...attempt.answers };
    for (const k of backup?.pending ?? []) if (k in (backup?.answers ?? {})) merged[k] = backup!.answers[k] ?? null;
    return merged;
  });
  const pending = useRef<Record<string, AnswerValue>>(Object.fromEntries((backup?.pending ?? []).filter((k) => k in (backup?.answers ?? {})).map((k) => [k, backup!.answers[k] ?? null])));
  const [flags, setFlags] = useState<Set<string>>(() => new Set(backup?.flags ?? []));
  const [pos, setPos] = useState(() => {
    if (backup && backup.pos >= 0 && backup.pos < questions.length) return backup.pos;
    return Math.max(0, questions.findIndex((x) => !answered(attempt.answers[x.id])));
  });
  const focusLosses = useRef(Math.max(attempt.focusLosses, backup?.focusLosses ?? 0));
  const focusSent = useRef(attempt.focusLosses);
  const [awayCount, setAwayCount] = useState(0);

  const [saveState, setSaveState] = useState<SaveState>(() => (Object.keys(pending.current).length ? 'saving' : 'saved'));
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const inflight = useRef(false);
  const retryDelay = useRef(2000);
  const timer = useRef<number | null>(null);
  const submitting = useRef(false);
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'retrying'>('idle');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ---- clock: server time = device time + offset
  const offset = useRef(Date.parse(room.serverNow) - receivedAt);
  const endsAt = Date.parse(attempt.endsAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);
  const remaining = Math.max(0, Math.round((endsAt - (now + offset.current)) / 1000));

  // ---- device backup
  const persist = useCallback(
    (next?: Partial<Backup>) => {
      store.write(key, {
        answers: next?.answers ?? answersRef.current,
        pending: Object.keys(pending.current),
        flags: [...(next?.flags ?? flagsRef.current)],
        pos: next?.pos ?? posRef.current,
        focusLosses: focusLosses.current,
      } satisfies Backup);
    },
    [key],
  );
  const answersRef = useRef(answers);
  const flagsRef = useRef<string[]>([...flags]);
  const posRef = useRef(pos);
  useEffect(() => {
    answersRef.current = answers;
    flagsRef.current = [...flags];
    posRef.current = pos;
    persist();
  }, [answers, flags, pos, persist]);

  // ---- saving
  const flush = useCallback(async () => {
    if (inflight.current || submitting.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const batch = { ...pending.current };
    const keys = Object.keys(batch);
    if (!keys.length && focusLosses.current <= focusSent.current) {
      setSaveState('saved');
      return;
    }
    inflight.current = true;
    setSaveState('saving');
    try {
      const r = await saveAnswers(examId, { answers: batch, focusLosses: focusLosses.current });
      for (const k of keys) if (pending.current[k] === batch[k]) delete pending.current[k];
      focusSent.current = Math.max(focusSent.current, focusLosses.current);
      persist();
      // Keep the countdown honest if the device clock drifts.
      const drift = Date.parse(r.serverNow) - Date.now() - offset.current;
      if (Math.abs(drift) > 2000) offset.current += drift;
      retryDelay.current = 2000;
      setSavedAt(Date.now());
      if (Object.keys(pending.current).length) {
        setSaveState('saving');
        timer.current = window.setTimeout(() => void flushRef.current(), 200);
      } else setSaveState('saved');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Time is up or it was handed in elsewhere: show what the server has.
        store.remove(key);
        void queryClient.invalidateQueries({ queryKey: cbtKeys.room(examId) });
        return;
      }
      if (err instanceof ApiError && err.status === 400) {
        for (const k of keys) if (pending.current[k] === batch[k]) delete pending.current[k];
        persist();
        setSaveState('error');
        toast.error(err.message);
        return;
      }
      // No network, server busy or restarting: keep the answers on the device and try again.
      setSaveState('offline');
      const wait = retryDelay.current;
      retryDelay.current = Math.min(15_000, retryDelay.current * 2);
      timer.current = window.setTimeout(() => void flushRef.current(), wait);
    } finally {
      inflight.current = false;
    }
  }, [examId, key, persist]);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const schedule = useCallback((delay: number) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flushRef.current(), delay);
  }, []);

  // Send anything left over from before a reload, and retry when the network returns.
  useEffect(() => {
    if (Object.keys(pending.current).length) schedule(300);
    const online = () => {
      retryDelay.current = 2000;
      schedule(0);
    };
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('online', online);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [schedule]);

  // Warn before leaving with unsaved answers.
  useEffect(() => {
    const before = (ev: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length && !submitting.current) ev.preventDefault();
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, []);

  const setAnswer = (qid: string, v: AnswerValue, delay: number) => {
    if (submitting.current) return;
    setAnswers((a) => ({ ...a, [qid]: v }));
    pending.current[qid] = v;
    setSaveState((s) => (s === 'offline' ? s : 'saving'));
    schedule(delay);
  };

  // ---- leaving the screen
  useEffect(() => {
    let last = 0;
    const lost = () => {
      if (submitting.current) return;
      const t = Date.now();
      if (t - last < 1500) return; // blur and visibilitychange fire together
      last = t;
      focusLosses.current += 1;
      persist();
      setAwayCount((n) => n + 1);
    };
    const vis = () => (document.visibilityState === 'hidden' ? lost() : schedule(0));
    const blur = () => lost();
    const focus = () => schedule(0);
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
    };
  }, [persist, schedule]);

  // ---- handing in
  const submit = useCallback(
    async (auto: boolean) => {
      if (submitting.current && !auto) return;
      submitting.current = true;
      setSubmitState('submitting');
      if (timer.current) window.clearTimeout(timer.current);
      const attemptOnce = async (): Promise<void> => {
        try {
          const r = await submitExam(examId, { answers: { ...pending.current }, focusLosses: focusLosses.current });
          store.remove(key);
          queryClient.setQueryData(cbtKeys.room(examId), r);
          void queryClient.invalidateQueries({ queryKey: cbtKeys.my });
          try {
            if (document.fullscreenElement) await document.exitFullscreen();
          } catch {
            /* ignore */
          }
        } catch (err) {
          if (err instanceof ApiError && err.status > 0 && err.status < 500 && err.status !== 429) {
            // Already handed in, or no longer allowed: show the server's view.
            store.remove(key);
            void queryClient.invalidateQueries({ queryKey: cbtKeys.room(examId) });
            return;
          }
          setSubmitState('retrying');
          window.setTimeout(() => void attemptOnce(), 4000);
        }
      };
      await attemptOnce();
    },
    [examId, key],
  );

  // ---- time warnings and auto-submit
  const warned = useRef({ five: remaining <= 300, one: remaining <= 60 });
  useEffect(() => {
    if (remaining <= 0) {
      if (!submitting.current) {
        toast.info('Time is up — handing in your answers');
        void submit(true);
      }
      return;
    }
    if (remaining <= 60 && !warned.current.one) {
      warned.current.one = true;
      toast.warning('1 minute left', { description: 'Your answers will be handed in automatically at zero.' });
    } else if (remaining <= 300 && !warned.current.five) {
      warned.current.five = true;
      toast.warning('5 minutes left', { description: 'Check any flagged or unanswered questions.' });
    }
  }, [remaining, submit]);

  // ---- navigation and keyboard
  const q = questions[pos]!;
  const go = useCallback((i: number) => setPos(Math.max(0, Math.min(questions.length - 1, i))), [questions.length]);
  const toggleFlag = (qid: string) =>
    setFlags((f) => {
      const n = new Set(f);
      if (n.has(qid)) n.delete(qid);
      else n.add(qid);
      return n;
    });

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey || confirmOpen || paletteOpen) return;
      const t = ev.target as HTMLElement | null;
      if (t?.closest('textarea, input, select, [contenteditable="true"]')) return;
      const k = ev.key.toLowerCase();
      if (k === 'n' || ev.key === 'ArrowRight') {
        ev.preventDefault();
        go(pos + 1);
      } else if (k === 'p' || ev.key === 'ArrowLeft') {
        ev.preventDefault();
        go(pos - 1);
      } else if (q.objective && k.length === 1 && k >= 'a' && k <= 'f') {
        const i = k.charCodeAt(0) - 97;
        if (i < q.options.length) {
          ev.preventDefault();
          setAnswer(q.id, i, 150);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const answeredCount = questions.filter((x) => answered(answers[x.id])).length;
  const unanswered = questions.filter((x) => !answered(answers[x.id]));
  const lowTime = remaining <= 300;
  const critical = remaining <= 60;
  const handingIn = submitState !== 'idle';

  const palette = (
    <Palette
      questions={questions}
      answers={answers}
      flags={flags}
      pos={pos}
      onPick={(i) => {
        go(i);
        setPaletteOpen(false);
      }}
    />
  );

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[14.5px] font-semibold tracking-tight sm:text-[15.5px]">{room.exam.title}</p>
            <SaveIndicator state={saveState} savedAt={savedAt} />
          </div>
          <span
            role="timer"
            aria-label={`Time left ${clock(remaining)}`}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[15px] font-semibold tabular sm:text-base',
              critical ? 'animate-pulse bg-danger text-white' : lowTime ? 'bg-danger-soft text-danger' : 'bg-muted',
            )}
          >
            <Clock className="size-4" aria-hidden />
            {clock(remaining)}
          </span>
          <Button variant="outline" size="icon" className="lg:hidden" onClick={() => setPaletteOpen(true)} aria-label="All questions">
            <LayoutGrid />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:inline-flex"
            aria-label="Full screen"
            title="Full screen"
            onClick={() => {
              try {
                void document.documentElement.requestFullscreen?.();
              } catch {
                /* not supported */
              }
            }}
          >
            <Maximize2 />
          </Button>
        </div>
        <div className="h-1 bg-muted" aria-hidden>
          <div className="h-full bg-brand transition-[width]" style={{ width: `${(answeredCount / Math.max(1, questions.length)) * 100}%` }} />
        </div>
      </header>

      {awayCount > 0 && (
        <div role="status" className="border-b border-warning/30 bg-warning-soft px-4 py-2 text-[13px] text-warning">
          <div className="mx-auto flex max-w-6xl items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            <span className="flex-1">You left the exam screen. Please stay on this page until you hand in — your teacher can see how often this happens.</span>
            <button type="button" className="shrink-0 font-medium underline-offset-2 hover:underline" onClick={() => setAwayCount(0)}>
              OK
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-4 sm:py-6 lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-6">
        <section aria-live="polite">
          <QuestionView
            q={q}
            total={questions.length}
            value={answers[q.id]}
            flagged={flags.has(q.id)}
            disabled={handingIn}
            onChoose={(i) => setAnswer(q.id, i, 150)}
            onWrite={(text) => setAnswer(q.id, text, 1200)}
            onBlurText={() => schedule(0)}
            onFlag={() => toggleFlag(q.id)}
          />
          <div className="mt-4 hidden items-center justify-between gap-2 lg:flex">
            <Button variant="outline" onClick={() => go(pos - 1)} disabled={pos === 0}>
              <ArrowLeft /> Previous <Kbd className="ml-1">P</Kbd>
            </Button>
            {pos < questions.length - 1 ? (
              <Button onClick={() => go(pos + 1)}>
                Next <Kbd className="ml-1 border-white/20 bg-white/10 text-inherit">N</Kbd> <ArrowRight />
              </Button>
            ) : (
              <Button onClick={() => setConfirmOpen(true)} disabled={handingIn}>
                <Send /> Hand in
              </Button>
            )}
          </div>
          <p className="mt-4 hidden text-center text-[12px] text-muted-foreground lg:block">
            Keyboard: <Kbd>A</Kbd>–<Kbd>D</Kbd> choose an option · <Kbd>N</Kbd> next · <Kbd>P</Kbd> previous
          </p>
        </section>
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4">
            <Card className="p-4">{palette}</Card>
            <Button className="w-full" onClick={() => setConfirmOpen(true)} disabled={handingIn}>
              <Send /> Hand in
            </Button>
          </div>
        </aside>
      </main>

      {/* Phone controls stay within thumb reach. */}
      <nav className="sticky bottom-0 z-20 border-t border-border bg-card/95 px-3 py-2.5 backdrop-blur lg:hidden" aria-label="Question navigation">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <Button variant="outline" className="h-11 flex-1" onClick={() => go(pos - 1)} disabled={pos === 0}>
            <ArrowLeft /> Prev
          </Button>
          <Button variant={flags.has(q.id) ? 'secondary' : 'ghost'} size="icon" className="size-11 shrink-0" onClick={() => toggleFlag(q.id)} aria-pressed={flags.has(q.id)} aria-label={flags.has(q.id) ? 'Remove flag' : 'Flag for review'}>
            <Flag className={cn(flags.has(q.id) && 'fill-current text-warning')} />
          </Button>
          {pos < questions.length - 1 ? (
            <Button className="h-11 flex-1" onClick={() => go(pos + 1)}>
              Next <ArrowRight />
            </Button>
          ) : (
            <Button className="h-11 flex-1" onClick={() => setConfirmOpen(true)} disabled={handingIn}>
              <Send /> Hand in
            </Button>
          )}
        </div>
      </nav>

      <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>All questions</DialogTitle>
            <DialogDescription>
              {answeredCount} of {questions.length} answered
            </DialogDescription>
          </DialogHeader>
          <DialogBody>{palette}</DialogBody>
          <DialogFooter>
            <Button
              onClick={() => {
                setPaletteOpen(false);
                setConfirmOpen(true);
              }}
              disabled={handingIn}
            >
              <Send /> Hand in
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Hand in your answers?</DialogTitle>
            <DialogDescription>You can’t change anything after this.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3 text-[14px]">
            <p>
              You’ve answered <strong className="tabular">{answeredCount}</strong> of <strong className="tabular">{questions.length}</strong>.
            </p>
            {unanswered.length > 0 && (
              <div className="rounded-xl bg-warning-soft px-3 py-2 text-warning">
                <p className="font-medium">
                  {unanswered.length} unanswered: {unanswered.slice(0, 12).map((x) => `Q${x.number}`).join(', ')}
                  {unanswered.length > 12 ? '…' : ''}
                </p>
                <button
                  type="button"
                  className="mt-1 text-[13px] underline underline-offset-2"
                  onClick={() => {
                    setConfirmOpen(false);
                    go(questions.indexOf(unanswered[0]!));
                  }}
                >
                  Go to the first one
                </button>
              </div>
            )}
            {flags.size > 0 && <p className="text-muted-foreground">{flags.size} flagged for review.</p>}
            <p className="text-muted-foreground">Time left: {clock(remaining)}</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Keep working
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                void submit(false);
              }}
              loading={handingIn}
            >
              <Send /> Hand in
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {handingIn && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 px-6 backdrop-blur-sm" role="alertdialog" aria-live="assertive" aria-label="Handing in">
          <Card className="max-w-sm p-6 text-center">
            {submitState === 'retrying' ? <CloudOff className="mx-auto size-8 text-warning" /> : <Loader2 className="mx-auto size-8 animate-spin text-brand" />}
            <p className="mt-3 font-display text-lg font-semibold">{submitState === 'retrying' ? 'Waiting for the network…' : 'Handing in…'}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {submitState === 'retrying'
                ? `Your answers are kept on this device and we’ll keep trying. Don’t close this page. Anything saved before time ran out (plus ${CBT_GRACE_SECONDS} seconds) is handed in even if the network doesn’t come back.`
                : 'Please wait a moment.'}
            </p>
          </Card>
        </div>
      )}
    </>
  );
}

function SaveIndicator({ state, savedAt }: { state: SaveState; savedAt: number | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 15_000);
    return () => window.clearInterval(t);
  }, []);
  if (state === 'offline') {
    return (
      <p className="flex items-center gap-1 text-[12px] font-medium text-warning" role="status">
        <CloudOff className="size-3.5" /> Offline — answers kept on this device, will retry
      </p>
    );
  }
  if (state === 'saving') {
    return (
      <p className="flex items-center gap-1 text-[12px] text-muted-foreground" role="status">
        <Loader2 className="size-3.5 animate-spin" /> Saving…
      </p>
    );
  }
  if (state === 'error') {
    return (
      <p className="flex items-center gap-1 text-[12px] text-danger" role="status">
        <XCircle className="size-3.5" /> Couldn’t save that answer
      </p>
    );
  }
  const ago = savedAt ? Math.round((Date.now() - savedAt) / 1000) : null;
  return (
    <p className="flex items-center gap-1 text-[12px] text-success" role="status">
      <Check className="size-3.5" /> Saved{ago != null && ago >= 30 ? ` ${Math.round(ago / 60) || 1} min ago` : ''}
    </p>
  );
}

export function QuestionView({
  q,
  total,
  value,
  flagged,
  disabled,
  onChoose,
  onWrite,
  onBlurText,
  onFlag,
}: {
  q: CbtRoomQuestion;
  total: number;
  value: AnswerValue | undefined;
  flagged: boolean;
  disabled: boolean;
  onChoose: (i: number) => void;
  onWrite: (text: string) => void;
  onBlurText: () => void;
  onFlag: () => void;
}) {
  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-medium text-muted-foreground">
          Question {q.number} of {total} · {q.marks} mark{q.marks === 1 ? '' : 's'}
        </p>
        <Button variant={flagged ? 'secondary' : 'ghost'} size="sm" onClick={onFlag} aria-pressed={flagged} className="hidden lg:inline-flex">
          <Flag className={cn(flagged && 'fill-current text-warning')} /> {flagged ? 'Flagged' : 'Flag for review'}
        </Button>
        {flagged && (
          <Badge variant="warning" className="lg:hidden">
            <Flag /> Flagged
          </Badge>
        )}
      </div>
      <p className="whitespace-pre-wrap break-words text-[16px] font-medium leading-relaxed sm:text-[17px]">{q.stem}</p>
      {q.objective ? (
        <div className="mt-5 space-y-2.5" role="radiogroup" aria-label={`Question ${q.number} options`}>
          {q.options.map((o, i) => {
            const on = value === i;
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={disabled}
                onClick={() => onChoose(i)}
                className={cn(
                  'flex min-h-12 w-full items-start gap-3 rounded-xl border-2 p-3 text-left text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  on ? 'border-brand bg-brand-soft' : 'border-border hover:border-border-strong hover:bg-muted/50',
                )}
              >
                <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg text-[13px] font-semibold', on ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground')}>{LETTERS[i]}</span>
                <span className="min-w-0 break-words pt-0.5">{o}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-5">
          <Textarea
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onWrite(e.target.value)}
            onBlur={onBlurText}
            disabled={disabled}
            rows={9}
            maxLength={8000}
            placeholder="Type your answer here…"
            aria-label={`Answer to question ${q.number}`}
            className="text-[15px]"
          />
          <p className="mt-1 text-right text-[11.5px] text-muted-foreground tabular">{typeof value === 'string' ? value.length : 0} / 8000</p>
        </div>
      )}
    </Card>
  );
}

export function Palette({ questions, answers, flags, pos, onPick }: { questions: CbtRoomQuestion[]; answers: Record<string, AnswerValue>; flags: Set<string>; pos: number; onPick: (i: number) => void }) {
  return (
    <div>
      <ol className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-5">
        {questions.map((x, i) => {
          const done = answered(answers[x.id]);
          const flagged = flags.has(x.id);
          return (
            <li key={x.id}>
              <button
                type="button"
                onClick={() => onPick(i)}
                aria-current={i === pos ? 'step' : undefined}
                aria-label={`Question ${x.number}${done ? ', answered' : ', not answered'}${flagged ? ', flagged' : ''}`}
                className={cn(
                  'relative grid h-10 w-full place-items-center rounded-lg border text-[13px] font-medium tabular transition-colors',
                  i === pos ? 'border-brand bg-brand text-brand-foreground' : done ? 'border-transparent bg-brand-soft text-brand' : 'border-border hover:bg-muted',
                )}
              >
                {x.number}
                {flagged && <span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-warning ring-2 ring-card" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded bg-brand-soft ring-1 ring-brand/30" /> Answered
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded border border-border" /> Not yet
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-warning" /> Flagged
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ after handing in

function Finished({ room }: { room: CbtRoom }) {
  const a = room.attempt!;
  const r = room.result;
  const review = r?.review ? new Map(r.review.map((x) => [x.questionId, x])) : null;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <BackLink />
      <Card className="mt-3 p-6 text-center sm:p-8">
        <CheckCircle2 className="mx-auto size-10 text-success" />
        <h1 className="mt-3 font-display text-xl font-semibold tracking-tight">{room.exam.title}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Handed in {a.submittedAt ? formatDateTime(a.submittedAt) : ''}</p>
        {r ? (
          <div className="mt-5">
            <p className={cn('font-display text-4xl font-semibold tabular', r.percent >= 70 ? 'text-success' : r.percent >= 50 ? 'text-warning' : 'text-danger')}>{r.percent}%</p>
            <p className="mt-1 text-[14px] tabular text-muted-foreground">
              {r.score} out of {r.total} marks{r.partial ? ' so far' : ''}
            </p>
          </div>
        ) : null}
        {room.resultNote && <p className="mx-auto mt-4 max-w-md rounded-xl bg-muted px-4 py-3 text-[13.5px]">{room.resultNote}</p>}
      </Card>

      {review && a.questions.length > 0 && (
        <section className="mt-6" aria-labelledby="review-h">
          <h2 id="review-h" className="mb-3 font-display text-[15px] font-semibold tracking-tight">
            Review your answers
          </h2>
          <ol className="space-y-3">
            {a.questions.map((q) => {
              const rv = review.get(q.id);
              const mine = a.answers[q.id];
              return (
                <li key={q.id}>
                  <Card className={cn('p-4 sm:p-5', rv?.correct === false && 'border-danger/25')}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[12px] font-medium text-muted-foreground">Question {q.number}</span>
                      {q.objective ? (
                        rv?.correct ? (
                          <Badge variant="success">
                            <CheckCircle2 /> Correct
                          </Badge>
                        ) : (
                          <Badge variant="danger">
                            <XCircle /> {answered(mine) ? 'Wrong' : 'Not answered'}
                          </Badge>
                        )
                      ) : (
                        <Badge variant={rv?.awarded != null ? 'info' : 'secondary'}>{rv?.awarded != null ? `${rv.awarded}/${q.marks}` : 'Being marked'}</Badge>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-[14.5px] font-medium">{q.stem}</p>
                    {q.objective ? (
                      <ul className="mt-3 space-y-1.5">
                        {q.options.map((o, i) => {
                          const key = rv?.correctIndex === i;
                          const chose = mine === i;
                          return (
                            <li key={i} className={cn('flex items-start gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px]', key ? 'bg-success-soft text-success' : chose ? 'bg-danger-soft text-danger' : 'text-muted-foreground')}>
                              <span className="w-4 shrink-0 font-semibold">{LETTERS[i]}</span>
                              <span className="min-w-0 flex-1">{o}</span>
                              {key && <Check className="size-4 shrink-0" aria-label="Correct answer" />}
                              {chose && !key && <span className="shrink-0 text-[11px] font-medium">Your answer</span>}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div className="mt-3 space-y-2 text-[13.5px]">
                        <p className="whitespace-pre-wrap rounded-lg bg-muted/60 px-3 py-2">{typeof mine === 'string' && mine.trim() ? mine : <em className="text-muted-foreground">No answer</em>}</p>
                        {rv?.modelAnswer && (
                          <p className="whitespace-pre-wrap rounded-lg bg-success-soft px-3 py-2 text-success">
                            <span className="font-semibold">Model answer: </span>
                            {rv.modelAnswer}
                          </p>
                        )}
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ol>
        </section>
      )}
      <div className="mt-6 text-center">
        <Button asChild variant="outline">
          <Link to="/my-exams">Back to my exams</Link>
        </Button>
      </div>
    </main>
  );
}
