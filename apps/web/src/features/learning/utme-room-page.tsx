import { utmeLabel, type PracticeAttemptView, type UtmeSection } from '@aischool/shared';
import { AlertTriangle, ArrowLeft, ArrowRight, Calculator, Check, Clock, CloudOff, Flag, LayoutGrid, Loader2, LogOut, Maximize2, Send, User, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/empty-state';
import { Kbd } from '@/components/ui/kbd';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import { queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import { lk, saveAttemptProgress, submitAttempt, useAttempt } from './api';
import { OnScreenCalculator } from './calculator';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** Device copy of the attempt: answers not yet confirmed by the server, flags and where the candidate was. */
interface Backup {
  answers: (number | null)[];
  /** The answers above are newer than the server's. */
  dirty: boolean;
  flags: number[];
  pos: number;
  /** Last question seen in each subject (so switching tabs comes back to it). */
  lastPos: Record<string, number>;
}

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

export const utmeBackupKey = (id: string) => `utme:${id}`;

const clock = (sec: number) => {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h}:${pad(m)}:${pad(s % 60)}`;
};

/**
 * The JAMB UTME CBT mock room: full screen, outside the app chrome, laid
 * out like the real CBT software — candidate panel, one countdown for the
 * whole paper, a tab per subject, a question palette, a calculator and the
 * keyboard shortcuts candidates practise with (A–D, N, P, S then Y).
 * The server's deadline is the authority; answers save to the server as
 * they change and are also kept on the device, so a dropped connection or
 * a reload loses nothing and resumes on the same question.
 */
export default function UtmeRoomPage() {
  const { id = '' } = useParams();
  const q = useAttempt(id);
  useDocumentTitle('JAMB UTME CBT mock');
  const a = q.data;
  if (a && (a.mode !== 'UTME' || a.submittedAt)) return <Navigate to={`/learn/attempts/${a.id}`} replace />;
  return (
    <div className="flex min-h-dvh flex-col bg-muted/40 text-foreground">
      {q.error && !a ? (
        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-4 py-8">
          <Card>
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          </Card>
          <Link to="/learn/exams" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Exam Academy
          </Link>
        </main>
      ) : !a ? (
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-8">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-80 w-full rounded-2xl" />
        </main>
      ) : (
        <Room key={a.id} a={a} receivedAt={q.dataUpdatedAt} />
      )}
    </div>
  );
}

type SaveState = 'saved' | 'saving' | 'offline';

function Room({ a, receivedAt }: { a: PracticeAttemptView; receivedAt: number }) {
  const navigate = useNavigate();
  const key = utmeBackupKey(a.id);
  const n = a.questions.length;
  const sections: UtmeSection[] = useMemo(() => (a.sections?.length ? a.sections : [{ subject: a.subject ?? 'Paper', label: utmeLabel(a.subject ?? 'Paper'), start: 0, count: n }]), [a.sections, a.subject, n]);
  const backup = useMemo(() => store.read<Backup>(key), [key]);
  const usable = !!backup && Array.isArray(backup.answers) && backup.answers.length === n;

  // Server answers, unless this device has newer ones the server hasn't confirmed.
  const [answers, setAnswers] = useState<(number | null)[]>(() => (usable && backup!.dirty ? backup!.answers : a.questions.map((x) => x.chosen ?? null)));
  const dirty = useRef(usable && backup!.dirty);
  const [flags, setFlags] = useState<Set<number>>(() => new Set(usable ? backup!.flags : []));
  const [pos, setPos] = useState(() => {
    if (usable && backup!.pos >= 0 && backup!.pos < n) return backup!.pos;
    return Math.max(0, answers.findIndex((x) => x == null));
  });
  const lastPos = useRef<Record<string, number>>(usable ? (backup!.lastPos ?? {}) : {});

  const [saveState, setSaveState] = useState<SaveState>(() => (dirty.current ? 'saving' : 'saved'));
  const inflight = useRef(false);
  const retryDelay = useRef(2000);
  const timer = useRef<number | null>(null);
  const submitting = useRef(false);
  const submitRetry = useRef<(() => void) | null>(null);
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'retrying'>('idle');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);

  // ---- clock: the server's deadline, corrected for this device's clock
  const offset = useRef(a.serverNow ? Date.parse(a.serverNow) - receivedAt : 0);
  const endsAt = a.endsAt ? Date.parse(a.endsAt) : Date.now() + 120 * 60_000;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);
  const remaining = Math.max(0, Math.round((endsAt - (now + offset.current)) / 1000));

  // ---- device backup (every change)
  const answersRef = useRef(answers);
  const flagsRef = useRef(flags);
  const posRef = useRef(pos);
  const persist = useCallback(() => {
    store.write(key, { answers: answersRef.current, dirty: dirty.current, flags: [...flagsRef.current], pos: posRef.current, lastPos: lastPos.current } satisfies Backup);
  }, [key]);
  useEffect(() => {
    answersRef.current = answers;
    flagsRef.current = flags;
    posRef.current = pos;
    persist();
  }, [answers, flags, pos, persist]);

  // ---- saving to the server
  const schedule = useCallback((delay: number) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flushRef.current(), delay);
  }, []);
  const flush = useCallback(async () => {
    if (submitting.current) return;
    if (!dirty.current) {
      setSaveState('saved');
      return;
    }
    if (inflight.current) return;
    inflight.current = true;
    setSaveState('saving');
    const snapshot = answersRef.current;
    dirty.current = false;
    try {
      await saveAttemptProgress(a.id, snapshot);
      if (snapshot !== answersRef.current) dirty.current = true;
      persist();
      retryDelay.current = 2000;
      if (dirty.current) schedule(300);
      else setSaveState('saved');
    } catch (err) {
      dirty.current = true;
      persist();
      if (err instanceof ApiError && err.status === 400) {
        // Already marked (time ran out long ago, or handed in elsewhere): show the result.
        store.remove(key);
        void queryClient.invalidateQueries({ queryKey: lk.attempt(a.id) });
        return;
      }
      // No network, or the server is busy: keep the answers here and try again.
      setSaveState('offline');
      const wait = retryDelay.current;
      retryDelay.current = Math.min(15_000, retryDelay.current * 2);
      schedule(wait);
    } finally {
      inflight.current = false;
    }
  }, [a.id, key, persist, schedule]);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    if (dirty.current) schedule(300);
    const online = () => {
      retryDelay.current = 2000;
      if (submitRetry.current) submitRetry.current();
      else schedule(0);
    };
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('online', online);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [schedule]);

  useEffect(() => {
    const before = (ev: BeforeUnloadEvent) => {
      if (dirty.current && !submitting.current) ev.preventDefault();
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, []);

  const choose = (qi: number, oi: number) => {
    if (submitting.current) return;
    setAnswers((x) => x.map((v, i) => (i === qi ? oi : v)));
    dirty.current = true;
    setSaveState((s) => (s === 'offline' ? s : 'saving'));
    schedule(400);
  };

  // ---- handing in
  const submit = useCallback(
    async (auto: boolean) => {
      if (submitting.current && !auto) return;
      if (submitting.current && submitRetry.current === null && auto) return;
      submitting.current = true;
      setSubmitState('submitting');
      if (timer.current) window.clearTimeout(timer.current);
      const once = async (): Promise<void> => {
        submitRetry.current = null;
        try {
          const v = await submitAttempt(a.id, answersRef.current, [...flagsRef.current].sort((x, y) => x - y));
          store.remove(key);
          queryClient.setQueryData(lk.attempt(a.id), v);
          for (const k of [lk.attempts, lk.home, lk.mastery, lk.exams]) void queryClient.invalidateQueries({ queryKey: k });
          try {
            if (document.fullscreenElement) await document.exitFullscreen();
          } catch {
            /* ignore */
          }
          navigate(`/learn/attempts/${a.id}`, { replace: true });
        } catch (err) {
          if (err instanceof ApiError && err.status > 0 && err.status < 500 && err.status !== 429 && err.status !== 401) {
            store.remove(key);
            void queryClient.invalidateQueries({ queryKey: lk.attempt(a.id) });
            navigate(`/learn/attempts/${a.id}`, { replace: true });
            return;
          }
          // Offline: answers stay on this device; try again every few seconds and as soon as the network is back.
          setSubmitState('retrying');
          submitRetry.current = () => void once();
          window.setTimeout(() => submitRetry.current?.(), 4000);
        }
      };
      await once();
    },
    [a.id, key, navigate],
  );

  // ---- time warnings (10 and 5 minutes, then 1) and auto-submit
  const warned = useRef({ ten: remaining <= 600, five: remaining <= 300, one: remaining <= 60 });
  useEffect(() => {
    if (remaining <= 0) {
      if (!submitting.current) {
        toast.info('Time is up — handing in your answers');
        void submit(true);
      }
      return;
    }
    if (remaining <= 60 && !warned.current.one) {
      warned.current.one = warned.current.five = warned.current.ten = true;
      toast.warning('1 minute left', { description: 'Your answers will be handed in automatically at zero.' });
    } else if (remaining <= 300 && !warned.current.five) {
      warned.current.five = warned.current.ten = true;
      toast.warning('5 minutes left', { description: 'Check flagged and unanswered questions in every subject.' });
    } else if (remaining <= 600 && !warned.current.ten) {
      warned.current.ten = true;
      toast.warning('10 minutes left', { description: 'Use the tabs to check each subject for unanswered questions.' });
    }
  }, [remaining, submit]);

  // ---- navigation
  const sectionOf = useCallback((i: number) => sections.find((s) => i >= s.start && i < s.start + s.count) ?? sections[0]!, [sections]);
  const current = sectionOf(pos);
  const go = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(n - 1, i));
      lastPos.current = { ...lastPos.current, [sectionOf(next).subject]: next };
      setPos(next);
    },
    [n, sectionOf],
  );
  const openSection = (s: UtmeSection) => go(lastPos.current[s.subject] ?? s.start);
  const toggleFlag = (i: number) =>
    setFlags((f) => {
      const x = new Set(f);
      if (x.has(i)) x.delete(i);
      else x.add(i);
      return x;
    });

  const q = a.questions[pos]!;
  const handingIn = submitState !== 'idle';
  const answeredIn = (s: UtmeSection) => answers.slice(s.start, s.start + s.count).filter((x) => x != null).length;
  const answeredAll = answers.filter((x) => x != null).length;

  // ---- keyboard, as in the CBT software: A–D choose, N next, P previous, S submit (then Y / N); arrows too
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey || handingIn) return;
      const t = ev.target as HTMLElement | null;
      if (t?.closest('textarea, input, select, [contenteditable="true"], [data-calculator]')) return;
      const k = ev.key.toLowerCase();
      if (confirmOpen) {
        if (k === 'y') {
          ev.preventDefault();
          setConfirmOpen(false);
          void submit(false);
        } else if (k === 'n') {
          ev.preventDefault();
          setConfirmOpen(false);
        }
        return;
      }
      if (paletteOpen) return;
      if (k === 'n' || ev.key === 'ArrowRight') {
        ev.preventDefault();
        go(pos + 1);
      } else if (k === 'p' || ev.key === 'ArrowLeft') {
        ev.preventDefault();
        go(pos - 1);
      } else if (k === 's') {
        ev.preventDefault();
        setConfirmOpen(true);
      } else if (k.length === 1 && k >= 'a' && k <= 'e') {
        const i = k.charCodeAt(0) - 97;
        if (i < q.options.length) {
          ev.preventDefault();
          choose(pos, i);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const lowTime = remaining <= 600;
  const veryLow = remaining <= 300;
  const critical = remaining <= 60;
  const indexIn = pos - current.start;

  const palette = (
    <SectionPalette
      section={current}
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
      <header className="sticky top-0 z-30 border-b border-border bg-card shadow-xs">
        <div className="mx-auto flex w-full max-w-[90rem] items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-success text-[11px] font-bold tracking-tight text-white" aria-hidden>
            CBT
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[14px] font-semibold tracking-tight sm:text-[15px]">JAMB UTME mock · Computer-based test</p>
            <SaveLine state={saveState} />
          </div>
          <div
            role="timer"
            aria-label={`Time left ${clock(remaining)}`}
            data-testid="utme-timer"
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 font-mono text-[16px] font-bold tabular sm:px-3.5 sm:text-[20px]',
              critical ? 'animate-pulse bg-danger text-white' : veryLow ? 'bg-danger-soft text-danger' : lowTime ? 'bg-warning-soft text-warning' : 'bg-foreground text-background',
            )}
          >
            <Clock className="size-4 sm:size-5" aria-hidden />
            {clock(remaining)}
          </div>
          <Button variant={calcOpen ? 'secondary' : 'outline'} size="icon" onClick={() => setCalcOpen((v) => !v)} aria-pressed={calcOpen} aria-label="Calculator" title="Calculator">
            <Calculator />
          </Button>
          <Button variant="outline" size="icon" className="lg:hidden" onClick={() => setPaletteOpen(true)} aria-label="Question palette">
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
          <Button className="hidden sm:inline-flex" onClick={() => setConfirmOpen(true)} disabled={handingIn}>
            <Send /> Submit <Kbd className="ml-0.5 border-white/20 bg-white/10 text-inherit">S</Kbd>
          </Button>
        </div>
        <nav className="border-t border-border bg-card" aria-label="Subjects">
          <div className="mx-auto flex w-full max-w-[90rem] gap-1 overflow-x-auto px-2 py-1.5 [scrollbar-width:thin] sm:px-4" role="tablist">
            {sections.map((s) => {
              const on = s.subject === current.subject;
              const done = answeredIn(s);
              return (
                <button
                  key={s.subject}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => openSection(s)}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors',
                    on ? 'bg-brand text-brand-foreground shadow-soft' : 'bg-muted/70 text-foreground hover:bg-muted',
                  )}
                >
                  {s.label}
                  <span className={cn('rounded-md px-1.5 py-0.5 text-[11.5px] tabular', on ? 'bg-white/20' : done === s.count ? 'bg-success-soft text-success' : 'bg-background text-muted-foreground')}>
                    {done}/{s.count}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {lowTime && (
        <div role="status" className={cn('border-b px-4 py-1.5 text-center text-[12.5px] font-medium', veryLow ? 'border-danger/30 bg-danger-soft text-danger' : 'border-warning/30 bg-warning-soft text-warning')}>
          <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
          {veryLow ? 'Less than 5 minutes left.' : 'Less than 10 minutes left.'} Your answers are handed in automatically when the clock reaches zero.
        </div>
      )}

      <main className="mx-auto w-full max-w-[90rem] flex-1 px-3 py-3 sm:px-4 sm:py-5 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)_17.5rem] lg:gap-5">
        <aside className="hidden lg:block">
          <CandidatePanel a={a} sections={sections} answeredIn={answeredIn} />
        </aside>
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[12.5px] lg:hidden">
          <User className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold">{a.candidate?.name ?? 'Candidate'}</span>
            {a.candidate?.number ? <span className="text-muted-foreground"> · {a.candidate.number}</span> : null}
          </span>
          <span className="shrink-0 tabular text-muted-foreground">
            {answeredAll}/{n} answered
          </span>
        </div>

        <section aria-live="polite" className="min-w-0">
          <Card className="p-4 sm:p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-semibold">
                {current.label} <span className="font-normal text-muted-foreground">· Question</span> <span className="tabular" data-testid="utme-qno">{indexIn + 1}</span>
                <span className="font-normal text-muted-foreground"> of {current.count}</span>
              </p>
              <Button variant={flags.has(pos) ? 'secondary' : 'outline'} size="sm" onClick={() => toggleFlag(pos)} aria-pressed={flags.has(pos)} disabled={handingIn}>
                <Flag className={cn(flags.has(pos) && 'fill-current text-warning')} /> {flags.has(pos) ? 'Flagged for review' : 'Flag for review'}
              </Button>
            </div>
            <p className="whitespace-pre-wrap break-words text-[16px] font-medium leading-relaxed sm:text-[17px]" data-testid="utme-stem">
              {q.stem}
            </p>
            <div className="mt-5 space-y-2.5" role="radiogroup" aria-label={`Question ${indexIn + 1} options`}>
              {q.options.map((o, i) => {
                const on = answers[pos] === i;
                return (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={handingIn}
                    onClick={() => choose(pos, i)}
                    className={cn(
                      'flex min-h-12 w-full items-start gap-3 rounded-xl border-2 p-3 text-left text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      on ? 'border-brand bg-brand-soft' : 'border-border bg-background hover:border-border-strong hover:bg-muted/50',
                    )}
                  >
                    <span className={cn('grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold', on ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground')}>{LETTERS[i]}</span>
                    <span className="min-w-0 break-words pt-0.5">{o}</span>
                  </button>
                );
              })}
            </div>
          </Card>
          <div className="mt-4 hidden items-center justify-between gap-2 lg:flex">
            <Button variant="outline" onClick={() => go(pos - 1)} disabled={pos === 0}>
              <ArrowLeft /> Previous <Kbd className="ml-1">P</Kbd>
            </Button>
            <Button onClick={() => go(pos + 1)} disabled={pos === n - 1}>
              Next <Kbd className="ml-1 border-white/20 bg-white/10 text-inherit">N</Kbd> <ArrowRight />
            </Button>
          </div>
          <p className="mt-4 hidden text-center text-[12px] text-muted-foreground lg:block">
            Keyboard: <Kbd>A</Kbd>–<Kbd>D</Kbd> choose · <Kbd>N</Kbd> next · <Kbd>P</Kbd> previous · <Kbd>S</Kbd> submit, then <Kbd>Y</Kbd> yes / <Kbd>N</Kbd> no · arrow keys move too
          </p>
        </section>

        <aside className="hidden lg:block">
          <div className="sticky top-32 space-y-3">
            <Card className="p-4">{palette}</Card>
            <Button className="w-full" onClick={() => setConfirmOpen(true)} disabled={handingIn}>
              <Send /> Submit
            </Button>
          </div>
        </aside>
      </main>

      {/* Phones and tablets: controls within thumb reach. */}
      <nav className="sticky bottom-0 z-20 border-t border-border bg-card/95 px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur lg:hidden" aria-label="Question navigation">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <Button variant="outline" className="h-11 flex-1" onClick={() => go(pos - 1)} disabled={pos === 0}>
            <ArrowLeft /> Prev
          </Button>
          <Button variant="outline" className="h-11 shrink-0 px-3" onClick={() => setPaletteOpen(true)} aria-label="Question palette">
            <LayoutGrid /> <span className="tabular">{indexIn + 1}</span>
          </Button>
          <Button variant="outline" className="h-11 shrink-0 px-3 sm:hidden" onClick={() => setConfirmOpen(true)} disabled={handingIn} aria-label="Submit">
            <Send />
          </Button>
          <Button className="h-11 flex-1" onClick={() => go(pos + 1)} disabled={pos === n - 1}>
            Next <ArrowRight />
          </Button>
        </div>
      </nav>

      <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
        <SheetContent side="right" className="sm:max-w-sm">
          <SheetHeader>
            <SheetTitle className="font-display text-[16px] font-semibold">{current.label}</SheetTitle>
            <SheetDescription className="text-[13px] text-muted-foreground">
              {answeredIn(current)} of {current.count} answered · {answeredAll} of {n} in all
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {sections.map((s) => (
                <Button key={s.subject} size="sm" variant={s.subject === current.subject ? 'default' : 'outline'} onClick={() => openSection(s)}>
                  {s.label} <span className="tabular opacity-80">{answeredIn(s)}/{s.count}</span>
                </Button>
              ))}
            </div>
            {palette}
            <Button
              className="w-full"
              onClick={() => {
                setPaletteOpen(false);
                setConfirmOpen(true);
              }}
              disabled={handingIn}
            >
              <Send /> Submit
            </Button>
          </SheetBody>
        </SheetContent>
      </Sheet>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Submit your answers?</DialogTitle>
            <DialogDescription>You can’t change anything after this. Press Y to submit or N to go back.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3 text-[14px]">
            <p>
              You’ve answered <strong className="tabular">{answeredAll}</strong> of <strong className="tabular">{n}</strong>.
            </p>
            <ul className="divide-y divide-border rounded-xl border border-border" data-testid="utme-unanswered">
              {sections.map((s) => {
                const left = s.count - answeredIn(s);
                return (
                  <li key={s.subject} className="flex items-center justify-between gap-2 px-3 py-2 text-[13.5px]">
                    <span>{s.label}</span>
                    {left ? (
                      <button
                        type="button"
                        className="font-medium text-warning underline-offset-2 hover:underline"
                        onClick={() => {
                          setConfirmOpen(false);
                          const first = answers.findIndex((x, i) => x == null && i >= s.start && i < s.start + s.count);
                          go(first >= 0 ? first : s.start);
                        }}
                      >
                        {left} unanswered
                      </button>
                    ) : (
                      <span className="flex items-center gap-1 font-medium text-success">
                        <Check className="size-3.5" /> All answered
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {flags.size > 0 && <p className="text-muted-foreground">{flags.size} flagged for review.</p>}
            <p className="text-muted-foreground">Time left: {clock(remaining)}</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              No, go back <Kbd className="ml-1">N</Kbd>
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                void submit(false);
              }}
              loading={submitState === 'submitting'}
            >
              <Send /> Yes, submit <Kbd className="ml-1 border-white/20 bg-white/10 text-inherit">Y</Kbd>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OnScreenCalculator open={calcOpen} onClose={() => setCalcOpen(false)} />

      {handingIn && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 px-6 backdrop-blur-sm" role="alertdialog" aria-live="assertive" aria-label="Submitting">
          <Card className="max-w-sm p-6 text-center">
            {submitState === 'retrying' ? <CloudOff className="mx-auto size-8 text-warning" /> : <Loader2 className="mx-auto size-8 animate-spin text-brand" />}
            <p className="mt-3 font-display text-lg font-semibold">{submitState === 'retrying' ? 'Waiting for the network…' : 'Submitting…'}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {submitState === 'retrying'
                ? 'Your answers are kept on this device and will be handed in as soon as you are back online. Don’t close this page. If the network stays down, the answers already saved are marked a couple of minutes after time is up.'
                : 'Please wait a moment.'}
            </p>
          </Card>
        </div>
      )}
    </>
  );
}

function SaveLine({ state }: { state: SaveState }) {
  if (state === 'offline') {
    return (
      <p className="flex items-center gap-1 text-[11.5px] font-medium text-warning" role="status">
        <CloudOff className="size-3.5" /> Offline — answers kept on this device
      </p>
    );
  }
  if (state === 'saving') {
    return (
      <p className="flex items-center gap-1 text-[11.5px] text-muted-foreground" role="status">
        <Loader2 className="size-3.5 animate-spin" /> Saving…
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1 text-[11.5px] text-success" role="status">
      <Check className="size-3.5" /> All answers saved
    </p>
  );
}

function CandidatePanel({ a, sections, answeredIn }: { a: PracticeAttemptView; sections: UtmeSection[]; answeredIn: (s: UtmeSection) => number }) {
  const c = a.candidate;
  return (
    <Card className="sticky top-32 space-y-4 p-4" aria-label="Candidate">
      <div className="mx-auto grid aspect-[4/5] w-28 place-items-center rounded-lg border border-dashed border-border bg-muted text-muted-foreground" aria-label="Candidate photo">
        <div className="text-center">
          <User className="mx-auto size-10" aria-hidden />
          <p className="mt-1 text-[10.5px]">Photo</p>
        </div>
      </div>
      <dl className="space-y-2 text-[12.5px]">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Candidate</dt>
          <dd className="font-semibold" data-testid="utme-candidate">
            {c?.name ?? 'Candidate'}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Reg. no. (admission no.)</dt>
          <dd className="font-mono font-semibold">{c?.number ?? '—'}</dd>
        </div>
        {c?.className && (
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Class</dt>
            <dd>{c.className}</dd>
          </div>
        )}
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Subject combination</dt>
          <dd>
            <ul className="mt-1 space-y-1">
              {sections.map((s) => (
                <li key={s.subject} className="flex justify-between gap-2">
                  <span className="truncate">{s.label}</span>
                  <span className="shrink-0 tabular text-muted-foreground">
                    {answeredIn(s)}/{s.count}
                  </span>
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
      <p className="rounded-lg bg-muted/70 px-2.5 py-2 text-[11px] text-muted-foreground">A practice mock in the style of the UTME CBT. It is not an official JAMB examination.</p>
      <Link to="/learn/exams" className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground">
        <LogOut className="size-3.5" /> Leave for now (the clock keeps running)
      </Link>
    </Card>
  );
}

function SectionPalette({ section, answers, flags, pos, onPick }: { section: UtmeSection; answers: (number | null)[]; flags: Set<number>; pos: number; onPick: (i: number) => void }) {
  return (
    <div>
      <p className="mb-2 text-[12.5px] font-semibold">{section.label}</p>
      <ol className="grid grid-cols-8 gap-1 sm:grid-cols-10 lg:grid-cols-6" data-testid="utme-palette">
        {Array.from({ length: section.count }, (_, k) => {
          const i = section.start + k;
          const done = answers[i] != null;
          const flagged = flags.has(i);
          const here = i === pos;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onPick(i)}
                aria-current={here ? 'step' : undefined}
                aria-label={`Question ${k + 1}${done ? ', answered' : ', not answered'}${flagged ? ', flagged' : ''}`}
                className={cn(
                  'relative grid h-9 w-full place-items-center rounded-md border text-[12.5px] font-semibold tabular transition-colors',
                  flagged ? 'border-warning bg-warning text-white' : done ? 'border-success bg-success text-white' : 'border-border bg-background hover:bg-muted',
                  here && 'ring-2 ring-brand ring-offset-2 ring-offset-card',
                )}
              >
                {k + 1}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-success" /> Answered
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm border border-border bg-background" /> Not answered
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-warning" /> Flagged
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm ring-2 ring-brand" /> Current
        </span>
      </div>
      <p className="mt-2 hidden items-center gap-1 text-[11px] text-muted-foreground lg:flex">
        <XCircle className="size-3" aria-hidden /> Unanswered questions score zero.
      </p>
    </div>
  );
}
