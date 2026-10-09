import type { CbtRoomQuestion, OfflinePackContent, OfflineSeatEntry, OfflineSeatSecret, OfflineSignedPayload } from '@aischool/shared';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Clock, CloudOff, Flag, KeyRound, LayoutGrid, Loader2, LogIn, Send, ShieldCheck, UserRound, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/lib/auth-store';
import { formatDateTime } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Palette, QuestionView } from '../exam-room-page';
import { clock } from '../ui';
import { WrongCodeError, cryptoAvailable, deriveContentKey, importSigningKey, openContent, openSeat, randomId, sign } from './crypto';
import { idb, type AnswerValue, type OutboxItem, type Sitting, type StoredPack } from './db';
import { syncNow, useOfflineSync } from './sync';

const answered = (v: AnswerValue | undefined) => typeof v === 'number' || (typeof v === 'string' && v.trim().length > 0);

/** What a sitting needs in memory: the decrypted paper and this student's seat. */
interface Open {
  content: OfflinePackContent;
  contentKey: CryptoKey;
  /** Kept only in memory while the page is open, so the next student on an exam device needs just their PIN. */
  code: string | null;
}

type View =
  | { k: 'loading' }
  | { k: 'missing' }
  | { k: 'code' }
  | { k: 'student'; open: Open }
  | { k: 'lobby'; open: Open; entry: OfflineSeatEntry; seat: OfflineSeatSecret }
  | { k: 'player'; open: Open; sitting: Sitting }
  | { k: 'done'; open: Open | null; sitting: Sitting };

/**
 * An offline exam: works with no network at all. The invigilator's start code opens the paper,
 * the device keeps the time and the answers, and the signed hand-in waits in the outbox until
 * the device is online again.
 */
export default function OfflineRoomPage() {
  const { key = '' } = useParams();
  const packKey = decodeURIComponent(key);
  const [stored, setStored] = useState<StoredPack | null>(null);
  const [view, setView] = useState<View>({ k: 'loading' });
  const me = useAuthStore((s) => s.me);
  useDocumentTitle(stored?.pack.title ?? 'Offline exam');

  useEffect(() => {
    let live = true;
    void (async () => {
      const p = await idb.get<StoredPack>('packs', packKey).catch(() => undefined);
      if (!live) return;
      if (!p) return setView({ k: 'missing' });
      setStored(p);
      // A personal pack: carry on (or show the hand-in) without the code — the keys are kept with the sitting.
      if (p.pack.mode === 'PERSONAL') {
        const sittings = (await idb.all<Sitting>('sittings')).filter((s) => s.packKey === packKey);
        const s = sittings.find((x) => x.status === 'IN_PROGRESS') ?? sittings.find((x) => x.status === 'SUBMITTED');
        if (s) {
          if (s.status === 'SUBMITTED') return setView({ k: 'done', open: null, sitting: s });
          try {
            const content = await openContent(p.pack, s.contentKey);
            return setView({ k: 'player', open: { content, contentKey: s.contentKey, code: null }, sitting: s });
          } catch {
            /* fall through to the code */
          }
        }
      }
      setView({ k: 'code' });
    })();
    return () => {
      live = false;
    };
  }, [packKey]);

  if (view.k === 'loading') return <Centered><Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" /></Centered>;
  if (view.k === 'missing' || !stored) {
    return (
      <Centered>
        <BackLink />
        <Card className="p-6 text-center">
          <p className="font-medium">This exam isn’t on this device.</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Download it again from Exams while you’re online.</p>
        </Card>
      </Centered>
    );
  }
  const pack = stored.pack;
  if (pack.mode === 'PERSONAL' && me && me.user.id !== stored.ownerUserId) {
    return (
      <Centered>
        <BackLink />
        <Card className="p-6 text-center text-[14px]">This exam was downloaded by someone else on this device.</Card>
      </Centered>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {view.k === 'code' && <CodeStep stored={stored} onOpen={(o, seat) => (seat ? setView({ k: 'lobby', open: o, ...seat }) : setView({ k: 'student', open: o }))} />}
      {view.k === 'student' && <StudentStep stored={stored} open={view.open} onSeat={(entry, seat, existing) => (existing ? (existing.status === 'SUBMITTED' ? setView({ k: 'done', open: view.open, sitting: existing }) : setView({ k: 'player', open: view.open, sitting: existing })) : setView({ k: 'lobby', open: view.open, entry, seat }))} />}
      {view.k === 'lobby' && <Lobby stored={stored} open={view.open} entry={view.entry} seat={view.seat} onStart={(s) => setView({ k: 'player', open: view.open, sitting: s })} onBack={pack.mode === 'DEVICE' ? () => setView({ k: 'student', open: view.open }) : undefined} />}
      {view.k === 'player' && <Player stored={stored} open={view.open} initial={view.sitting} onDone={(s) => setView({ k: 'done', open: view.open, sitting: s })} />}
      {view.k === 'done' && <Done stored={stored} sitting={view.sitting} onNext={pack.mode === 'DEVICE' ? () => (view.open ? setView({ k: 'student', open: view.open }) : setView({ k: 'code' })) : undefined} />}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-1 flex-col items-stretch justify-center gap-4 px-4 py-8">{children}</main>;
}

function BackLink() {
  return (
    <Link to="/offline-exams" className="inline-flex items-center gap-1 self-start text-[13px] text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-3.5" /> Offline exams
    </Link>
  );
}

function ExamHeader({ stored }: { stored: StoredPack }) {
  const p = stored.pack;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="brand">{p.subject}</Badge>
        <Badge variant="outline">
          <WifiOff /> Offline
        </Badge>
        {p.mode === 'DEVICE' && <Badge variant="info">Exam device</Badge>}
      </div>
      <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight">{p.title}</h1>
      <p className="mt-1 text-[13.5px] text-muted-foreground">
        {p.classLevel} · {p.questionCount} questions · {p.totalMarks} marks · {p.durationMinutes} minutes
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ the start code

function CodeStep({ stored, onOpen }: { stored: StoredPack; onOpen: (o: Open, seat?: { entry: OfflineSeatEntry; seat: OfflineSeatSecret }) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fails, setFails] = useState(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const p = stored.pack;
  const early = p.availableFrom && Date.now() < Date.parse(p.availableFrom) - 5 * 60_000;
  const late = p.syncBy && Date.now() > Date.parse(p.syncBy);

  const submit = async () => {
    if (Date.now() < waitUntil) return setError('Too many wrong codes. Wait a moment and try again.');
    setBusy(true);
    setError(null);
    try {
      if (!cryptoAvailable()) throw new Error('This browser can’t open offline exams (it needs a secure https connection).');
      const key = await deriveContentKey(p, code);
      const content = await openContent(p, key);
      const open: Open = { content, contentKey: key, code };
      if (p.mode === 'PERSONAL') {
        const entry = content.seats[0];
        if (!entry) throw new Error('This download has no seat. Download it again.');
        // The lobby carries on an existing sitting (its clock and answers) if there is one.
        onOpen(open, { entry, seat: await openSeat(p, entry, key) });
      } else onOpen(open);
    } catch (err) {
      const n = fails + 1;
      setFails(n);
      if (n >= 5) setWaitUntil(Date.now() + 30_000);
      setError(err instanceof WrongCodeError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Centered>
      <BackLink />
      <Card className="p-5 sm:p-7">
        <ExamHeader stored={stored} />
        {early && (
          <p className="mt-4 flex gap-2 rounded-xl bg-warning-soft px-3 py-2 text-[13px] text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> This exam is meant to start from {formatDateTime(p.availableFrom)}. Check the device’s date and time.
          </p>
        )}
        {late && (
          <p className="mt-4 flex gap-2 rounded-xl bg-warning-soft px-3 py-2 text-[13px] text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> The time to sync this exam ({formatDateTime(p.syncBy)}) has passed. A late sitting is flagged for the teacher.
          </p>
        )}
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Start code" htmlFor="offline-code" error={error ?? undefined} hint="The invigilator types or reads out this code when the exam begins.">
            <Input
              id="offline-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="XXXXX-XXXXX"
              invalid={!!error}
              className="h-12 text-center font-mono text-lg tracking-[0.2em]"
            />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 6}>
            <KeyRound /> {busy ? 'Opening…' : 'Open the exam'}
          </Button>
        </form>
      </Card>
    </Centered>
  );
}

// ------------------------------------------------------------------ exam device: who is sitting

function StudentStep({ stored, open, onSeat }: { stored: StoredPack; open: Open; onSeat: (entry: OfflineSeatEntry, seat: OfflineSeatSecret, existing: Sitting | null) => void }) {
  const [adm, setAdm] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '');

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const entry = open.content.seats.find((s) => norm(s.admissionNumber) === norm(adm));
      if (!entry) throw new WrongCodeError('That admission number is not on this exam device.');
      const seat = await openSeat(stored.pack, entry, open.contentKey, open.code ?? undefined, pin);
      const existing = (await idb.get<Sitting>('sittings', `${stored.key}:${seat.seatId}`)) ?? null;
      if (existing?.status === 'IN_PROGRESS') {
        // Same student back after a restart: their clock and answers carry on.
        const s: Sitting = { ...existing, contentKey: open.contentKey, signingKey: await importSigningKey(seat.hmacKey) };
        await idb.put('sittings', s);
        return onSeat(entry, seat, s);
      }
      onSeat(entry, seat, existing);
      setPin('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Centered>
      <BackLink />
      <Card className="p-5 sm:p-7">
        <ExamHeader stored={stored} />
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2 text-[13px] text-success">
          <ShieldCheck className="size-4" /> Exam unlocked on this device. Each student signs in below.
        </p>
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Admission number" htmlFor="offline-adm">
            <Input id="offline-adm" value={adm} onChange={(e) => setAdm(e.target.value)} autoComplete="off" className="h-11" />
          </Field>
          <Field label="Exam PIN" htmlFor="offline-pin" error={error ?? undefined} hint="The 6-digit PIN on your slip from the invigilator.">
            <Input id="offline-pin" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" type="password" autoComplete="off" invalid={!!error} className="h-11 font-mono tracking-[0.3em]" />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!adm.trim() || pin.length < 6}>
            <LogIn /> Continue
          </Button>
        </form>
      </Card>
    </Centered>
  );
}

// ------------------------------------------------------------------ before starting

function Lobby({ stored, open, entry, seat, onStart, onBack }: { stored: StoredPack; open: Open; entry: OfflineSeatEntry; seat: OfflineSeatSecret; onStart: (s: Sitting) => void; onBack?: () => void }) {
  const [busy, setBusy] = useState(false);
  const p = stored.pack;
  const start = async () => {
    setBusy(true);
    try {
      const key = `${stored.key}:${seat.seatId}`;
      const existing = await idb.get<Sitting>('sittings', key);
      const signingKey = await importSigningKey(seat.hmacKey);
      if (existing) {
        const s = { ...existing, contentKey: open.contentKey, signingKey };
        await idb.put('sittings', s);
        return onStart(s);
      }
      const now = Date.now();
      const s: Sitting = {
        key,
        packKey: stored.key,
        examId: p.examId,
        packVersion: p.version,
        seatId: seat.seatId,
        studentId: seat.studentId,
        studentName: entry.name,
        admissionNumber: entry.admissionNumber,
        status: 'IN_PROGRESS',
        startedWall: now,
        monoMs: 0,
        lastWall: now,
        answers: {},
        flags: [],
        pos: 0,
        focusLosses: 0,
        clockIssues: [],
        contentKey: open.contentKey,
        signingKey,
        items: seat.items,
        submittedWall: null,
        submissionId: randomId(),
        elapsedSeconds: null,
      };
      await idb.put('sittings', s);
      // Tell the school it started, if there happens to be a connection (otherwise it rides along later).
      await queue(s, stored, 'progress', 'STARTED', false);
      void syncNow().catch(() => undefined);
      onStart(s);
    } catch (err) {
      toast.error((err as Error).message || 'Could not start on this device');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Centered>
      {onBack ? (
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 self-start text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Not you?
        </button>
      ) : (
        <BackLink />
      )}
      <Card className="p-5 sm:p-7">
        <ExamHeader stored={stored} />
        <p className="mt-4 flex items-center gap-2 text-[14px] font-medium">
          <UserRound className="size-4 text-brand" /> {entry.name} <span className="font-normal text-muted-foreground">· {entry.admissionNumber}</span>
        </p>
        {open.content.instructions && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-muted/60 px-4 py-3 text-[14px]">{open.content.instructions}</p>}
        <ul className="mt-4 space-y-2 text-[13.5px]">
          <li className="flex gap-2">
            <Clock className="mt-0.5 size-4 shrink-0 text-brand" /> You have {p.durationMinutes} minutes from when you press Start. The timer keeps running if the device restarts.
          </li>
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" /> Every answer is saved on this device as you go. No internet is needed.
          </li>
          <li className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> Don’t change the device’s date or time: it is recorded and your teacher will see it.
          </li>
          <li className="flex gap-2">
            <Send className="mt-0.5 size-4 shrink-0 text-brand" /> At zero your answers are handed in automatically. They are sent to the school when the device is next online.
          </li>
        </ul>
        <Button size="lg" className="mt-6 w-full" onClick={() => void start()} loading={busy}>
          Start the exam <ArrowRight />
        </Button>
      </Card>
    </Centered>
  );
}

// ------------------------------------------------------------------ signing and queueing

async function queue(s: Sitting, stored: StoredPack, kind: 'progress' | 'final', stage: 'STARTED' | 'SUBMITTED', auto: boolean, extra?: Partial<Sitting>) {
  const sitting = { ...s, ...extra };
  const elapsedMs = Math.max(sitting.monoMs, Date.now() - sitting.startedWall);
  const payload: OfflineSignedPayload = {
    v: 1,
    kind,
    examId: sitting.examId,
    packVersion: sitting.packVersion,
    seatId: sitting.seatId,
    submissionId: sitting.submissionId ?? randomId(),
    startedAt: new Date(sitting.startedWall).toISOString(),
    submittedAt: kind === 'final' ? new Date(sitting.submittedWall ?? Date.now()).toISOString() : null,
    elapsedSeconds: Math.round((sitting.elapsedSeconds != null ? sitting.elapsedSeconds * 1000 : elapsedMs) / 1000),
    monotonicSeconds: Math.round(sitting.monoMs / 1000),
    wallSeconds: Math.round(((sitting.submittedWall ?? Date.now()) - sitting.startedWall) / 1000),
    answers: kind === 'final' ? sitting.answers : {},
    answered: Object.values(sitting.answers).filter(answered).length,
    focusLosses: sitting.focusLosses,
    clockIssues: sitting.clockIssues.slice(0, 20),
    auto,
    stage,
  };
  const text = JSON.stringify(payload);
  const item: OutboxItem = {
    id: `${payload.submissionId}:${kind}`,
    kind,
    sittingKey: sitting.key,
    examId: sitting.examId,
    seatId: sitting.seatId,
    title: stored.pack.title,
    studentName: sitting.studentName,
    payload: text,
    signature: await sign(sitting.signingKey, text),
    createdAt: new Date().toISOString(),
    status: 'PENDING',
    tries: 0,
    lastTriedAt: null,
    lastError: null,
    result: null,
  };
  if (kind === 'final') await idb.handIn(sitting, [item]);
  else await idb.put('outbox', item);
  return sitting;
}

// ------------------------------------------------------------------ the paper

function Player({ stored, open, initial, onDone }: { stored: StoredPack; open: Open; initial: Sitting; onDone: (s: Sitting) => void }) {
  const p = stored.pack;
  const durationMs = p.durationMinutes * 60_000;
  const questions: CbtRoomQuestion[] = useMemo(() => {
    const byId = new Map(open.content.questions.map((q) => [q.id, q]));
    return initial.items.flatMap((it, i) => {
      const q = byId.get(it.id);
      if (!q) return [];
      return [{ id: q.id, number: i + 1, type: q.type, objective: q.objective, stem: q.stem, options: q.objective ? it.order.map((o) => q.options[o] ?? '') : [], marks: q.marks }];
    });
  }, [open.content.questions, initial.items]);

  const sitting = useRef<Sitting>(initial);
  const [answers, setAnswers] = useState(initial.answers);
  const [flags, setFlags] = useState(() => new Set(initial.flags));
  const [pos, setPos] = useState(() => Math.min(Math.max(0, initial.pos), Math.max(0, questions.length - 1)));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [handingIn, setHandingIn] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // ---- saving to the device: one write at a time, in order
  const chain = useRef(Promise.resolve());
  const persist = useCallback((patch: Partial<Sitting> = {}) => {
    sitting.current = { ...sitting.current, ...patch };
    const snapshot = sitting.current;
    chain.current = chain.current
      .then(() => idb.put('sittings', snapshot))
      .then(() => setSaveError(false))
      .catch(() => setSaveError(true));
    return chain.current;
  }, []);

  // ---- clock: monotonic time (performance.now) and the wall clock; the larger counts
  const perfBase = useRef(performance.now());
  const monoBase = useRef(initial.monoMs);
  const lastTick = useRef({ perf: performance.now(), wall: Date.now() });
  const [elapsedMs, setElapsedMs] = useState(() => Math.max(initial.monoMs, Date.now() - initial.startedWall));
  useEffect(() => {
    // Opened again after a restart: note it if the clock now reads earlier than the last save.
    if (Date.now() < initial.lastWall - 5000) {
      persist({ clockIssues: [...sitting.current.clockIssues, `Clock was ${Math.round((initial.lastWall - Date.now()) / 1000)}s behind the last save when reopened`] });
    }
    let lastSave = 0;
    const t = window.setInterval(() => {
      const perf = performance.now();
      const wall = Date.now();
      const mono = monoBase.current + (perf - perfBase.current);
      const dWall = wall - lastTick.current.wall;
      const dPerf = perf - lastTick.current.perf;
      lastTick.current = { perf, wall };
      const issues = sitting.current.clockIssues;
      if (dWall < -5000) sitting.current.clockIssues = [...issues, `Clock went back ${Math.round(-dWall / 1000)}s at ${new Date(wall).toISOString()}`];
      else if (dWall - dPerf > 60_000) sitting.current.clockIssues = [...issues, `Clock jumped forward ${Math.round((dWall - dPerf) / 1000)}s (or the device slept) at ${new Date(wall).toISOString()}`];
      const elapsed = Math.max(mono, wall - sitting.current.startedWall);
      setElapsedMs(elapsed);
      if (perf - lastSave > 5000 || sitting.current.clockIssues !== issues) {
        lastSave = perf;
        void persist({ monoMs: mono, lastWall: wall });
      }
    }, 500);
    return () => window.clearInterval(t);
  }, [initial.lastWall, persist]);
  const remaining = Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000));

  const setAnswer = (qid: string, v: AnswerValue) => {
    if (handingIn) return;
    setAnswers((a) => {
      const next = { ...a, [qid]: v };
      void persist({ answers: next });
      return next;
    });
  };
  useEffect(() => {
    void persist({ pos, flags: [...flags] });
  }, [pos, flags, persist]);

  // ---- leaving the screen
  useEffect(() => {
    let last = 0;
    const lost = () => {
      const t = Date.now();
      if (t - last < 1500) return;
      last = t;
      void persist({ focusLosses: sitting.current.focusLosses + 1 });
    };
    const vis = () => document.visibilityState === 'hidden' && lost();
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('blur', lost);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('blur', lost);
    };
  }, [persist]);

  // ---- handing in (on the device; the upload follows when online)
  const handing = useRef(false);
  const handIn = useCallback(
    async (auto: boolean) => {
      if (handing.current) return;
      handing.current = true;
      setHandingIn(true);
      try {
        await chain.current;
        const perf = performance.now();
        const mono = monoBase.current + (perf - perfBase.current);
        const wall = Date.now();
        const elapsed = Math.min(Math.max(mono, wall - sitting.current.startedWall), auto ? durationMs : Infinity);
        const final = await queue(sitting.current, stored, 'final', 'SUBMITTED', auto, {
          status: 'SUBMITTED',
          monoMs: mono,
          lastWall: wall,
          submittedWall: wall,
          elapsedSeconds: Math.round(elapsed / 1000),
        });
        sitting.current = final;
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
        } catch {
          /* ignore */
        }
        void syncNow().catch(() => undefined);
        onDone(final);
      } catch (err) {
        handing.current = false;
        setHandingIn(false);
        toast.error(`Couldn’t hand in on this device: ${(err as Error).message}. Try again.`);
      }
    },
    [durationMs, onDone, stored],
  );

  const warned = useRef({ five: remaining <= 300, one: remaining <= 60 });
  useEffect(() => {
    if (remaining <= 0) {
      if (!handing.current) {
        toast.info('Time is up — handing in your answers');
        void handIn(true);
      }
      return;
    }
    if (remaining <= 60 && !warned.current.one) {
      warned.current.one = true;
      toast.warning('1 minute left');
    } else if (remaining <= 300 && !warned.current.five) {
      warned.current.five = true;
      toast.warning('5 minutes left');
    }
  }, [remaining, handIn]);

  const q = questions[pos];
  const go = (i: number) => setPos(Math.max(0, Math.min(questions.length - 1, i)));
  const toggleFlag = (id: string) =>
    setFlags((f) => {
      const n = new Set(f);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const answeredCount = questions.filter((x) => answered(answers[x.id])).length;
  const unanswered = questions.filter((x) => !answered(answers[x.id]));
  if (!q) return <Centered>This exam has no questions.</Centered>;
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
            <p className="truncate font-display text-[14.5px] font-semibold tracking-tight sm:text-[15.5px]">{p.title}</p>
            <p className={cn('flex items-center gap-1 text-[12px]', saveError ? 'text-danger' : 'text-success')} role="status">
              {saveError ? <AlertTriangle className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
              {saveError ? 'Couldn’t save on this device — tell the invigilator' : `Saved on this device · ${sitting.current.studentName}`}
            </p>
          </div>
          <span role="timer" aria-label={`Time left ${clock(remaining)}`} className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[15px] font-semibold tabular sm:text-base', remaining <= 60 ? 'animate-pulse bg-danger text-white' : remaining <= 300 ? 'bg-danger-soft text-danger' : 'bg-muted')}>
            <Clock className="size-4" aria-hidden />
            {clock(remaining)}
          </span>
          <Button variant="outline" size="icon" className="lg:hidden" onClick={() => setPaletteOpen(true)} aria-label="All questions">
            <LayoutGrid />
          </Button>
        </div>
        <div className="h-1 bg-muted" aria-hidden>
          <div className="h-full bg-brand transition-[width]" style={{ width: `${(answeredCount / Math.max(1, questions.length)) * 100}%` }} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-4 sm:py-6 lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-6">
        <section aria-live="polite">
          <QuestionView q={q} total={questions.length} value={answers[q.id]} flagged={flags.has(q.id)} disabled={handingIn} onChoose={(i) => setAnswer(q.id, i)} onWrite={(t) => setAnswer(q.id, t)} onBlurText={() => undefined} onFlag={() => toggleFlag(q.id)} />
          <div className="mt-4 hidden items-center justify-between gap-2 lg:flex">
            <Button variant="outline" onClick={() => go(pos - 1)} disabled={pos === 0}>
              <ArrowLeft /> Previous
            </Button>
            {pos < questions.length - 1 ? (
              <Button onClick={() => go(pos + 1)}>
                Next <ArrowRight />
              </Button>
            ) : (
              <Button onClick={() => setConfirmOpen(true)} disabled={handingIn}>
                <Send /> Hand in
              </Button>
            )}
          </div>
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

      <nav className="sticky bottom-0 z-20 border-t border-border bg-card/95 px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur lg:hidden" aria-label="Question navigation">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <Button variant="outline" className="h-11 flex-1" onClick={() => go(pos - 1)} disabled={pos === 0}>
            <ArrowLeft /> Prev
          </Button>
          <Button variant={flags.has(q.id) ? 'secondary' : 'ghost'} size="icon" className="size-11 shrink-0" onClick={() => toggleFlag(q.id)} aria-pressed={flags.has(q.id)} aria-label="Flag for review">
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
              <p className="rounded-xl bg-warning-soft px-3 py-2 text-warning">
                {unanswered.length} unanswered: {unanswered.slice(0, 12).map((x) => `Q${x.number}`).join(', ')}
                {unanswered.length > 12 ? '…' : ''}
              </p>
            )}
            <p className="text-muted-foreground">Time left: {clock(remaining)}</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Keep working
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                void handIn(false);
              }}
              loading={handingIn}
            >
              <Send /> Hand in
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ------------------------------------------------------------------ after handing in

function Done({ stored, sitting, onNext }: { stored: StoredPack; sitting: Sitting; onNext?: () => void }) {
  const [item, setItem] = useState<OutboxItem | null>(null);
  const version = useOfflineSync((s) => s.version);
  const running = useOfflineSync((s) => s.running);
  useEffect(() => {
    void idb.all<OutboxItem>('outbox').then((all) => setItem(all.find((i) => i.sittingKey === sitting.key && i.kind === 'final') ?? null));
  }, [sitting.key, version]);
  const synced = item?.status === 'SYNCED' || item?.status === 'HELD';
  return (
    <Centered>
      <Card className="p-6 text-center sm:p-8">
        <CheckCircle2 className="mx-auto size-10 text-success" />
        <h1 className="mt-3 font-display text-xl font-semibold tracking-tight">Handed in</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          {stored.pack.title} · {sitting.studentName}
          {sitting.submittedWall ? ` · ${formatDateTime(new Date(sitting.submittedWall).toISOString())}` : ''}
        </p>
        <div className={cn('mx-auto mt-5 flex max-w-sm items-start gap-2 rounded-xl px-4 py-3 text-left text-[13.5px]', synced ? 'bg-success-soft text-success' : 'bg-muted')}>
          {synced ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : running ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" /> : <CloudOff className="mt-0.5 size-4 shrink-0" />}
          <span>
            {synced
              ? item?.status === 'HELD'
                ? 'Sent to the school. A teacher will check it before it is marked.'
                : 'Sent to the school and marked.'
              : 'Your answers are safely stored on this device. They will be sent to the school automatically when it is next online — don’t clear this browser’s data before then.'}
          </span>
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {!synced && (
            <Button variant="outline" onClick={() => void syncNow({ includeFailed: true })} loading={running}>
              Sync now
            </Button>
          )}
          {onNext ? (
            <Button onClick={onNext}>
              <UserRound /> Next student
            </Button>
          ) : (
            <Button asChild variant={synced ? 'default' : 'outline'}>
              <Link to="/offline-exams">Back to offline exams</Link>
            </Button>
          )}
        </div>
      </Card>
    </Centered>
  );
}
