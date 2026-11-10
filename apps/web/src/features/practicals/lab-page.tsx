import { isGuidedPractical, type PracticalAttemptView, type SimulatorId, type SimulatorStates } from '@aischool/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Box, CheckCircle2, Clock, Eye, FlaskConical, Loader2, Send, Square } from 'lucide-react';
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { AwayNotice, useFocusLosses } from '../cbt/focus';
import { clock, useCountdown } from '../learning/components';
import { pk, saveLabDraft, useLabAttempt, useSubmitLab } from './api';
import { LabResult } from './result';
import { LabSittingContext, SittingLockCard, sittingLock } from './sitting';
import { simulatorUi } from './simulators/registry';
import { defaultLabView, gpuTier, saveLabView } from './simulators/webgl';

/** The virtual lab: loads the attempt, mounts its simulator, autosaves, times EXAM mode, hands in and shows the marked result. */
export default function LabPage() {
  const { id = '' } = useParams();
  const q = useLabAttempt(id);
  const a = q.data;
  const lock = sittingLock(q.error);
  return (
    <Page className="max-w-6xl">
      {lock ? (
        <SittingLockCard lock={lock} />
      ) : q.error && !a ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !a ? (
        <div className="space-y-4">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-[480px] rounded-2xl" />
        </div>
      ) : (
        <LabHost key={a.id} a={a} receivedAt={q.dataUpdatedAt} />
      )}
    </Page>
  );
}

/** The device's copy of a practical exam's focus count, for when a save never made it. */
const focusKey = (id: string) => `practical-focus:${id}`;
const readFocus = (id: string) => {
  try {
    return Number(window.localStorage.getItem(focusKey(id))) || 0;
  } catch {
    return 0;
  }
};

function LabHost({ a, receivedAt }: { a: PracticalAttemptView; receivedAt: number }) {
  const entry = simulatorUi(a.simulatorId);
  const qc = useQueryClient();
  const [state, setState] = useState<SimulatorStates[SimulatorId]>(() => a.state ?? entry.empty());
  const latest = useRef(state);
  latest.current = state;
  const dirty = useRef(false);
  const handedIn = useRef(false);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [confirm, setConfirm] = useState(false);
  const [showWork, setShowWork] = useState<'2d' | '3d' | null>(null);
  const submit = useSubmitLab(a.id);
  const done = !!a.submittedAt;
  // The clock runs on server time (device clocks can be minutes out): the deadline in device time.
  const deviceEndsAt = useMemo(() => (a.endsAt ? new Date(Date.parse(a.endsAt) - (Date.parse(a.serverNow) - receivedAt)).toISOString() : null), [a.endsAt, a.serverNow, receivedAt]);
  const left = useCountdown(done ? null : deviceEndsAt);
  const sitting = !done && !!a.assessment;
  const trackFocus = sitting && a.assessment?.kind === 'EXAM';
  // Labs with a 3D view open in 3D on a capable device (or as this device last chose); the 2D lab is always one tap away.
  const can3d = !!entry.component3d && gpuTier() !== 'none';
  const [use3d, setUse3d] = useState(() => can3d && !entry.prefer2d && defaultLabView() === '3d');
  const chooseView = (v: '3d' | '2d') => {
    saveLabView(v);
    setUse3d(v === '3d');
  };

  const [focusAtStart] = useState(() => Math.max(a.focusLosses, trackFocus ? readFocus(a.id) : 0));
  const focus = useFocusLosses(focusAtStart, {
    enabled: trackFocus,
    ignore: () => handedIn.current,
    onLost: () => {
      dirty.current = true;
      try {
        window.localStorage.setItem(focusKey(a.id), String(focus.count.current));
      } catch {
        /* private mode or full: the server copy still counts */
      }
    },
    onBack: () => flush(),
  });
  const focusCount = focus.count;

  const flush = useCallback(() => {
    if (!dirty.current || handedIn.current) return;
    dirty.current = false;
    setSaved('saving');
    saveLabDraft(a.id, latest.current, trackFocus ? focusCount.current : undefined).then(
      () => setSaved('saved'),
      (err: unknown) => {
        dirty.current = true;
        setSaved('error');
        // Refused, not lost: the sitting may have been closed or handed in elsewhere. Look again rather than retry for ever.
        if (a.assessment && err instanceof ApiError && err.status === 400) void qc.invalidateQueries({ queryKey: pk.lab(a.id) });
      },
    );
  }, [a.id, a.assessment, qc, trackFocus, focusCount]);
  // Autosave a moment after the student stops, and at least every 15 seconds while working.
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(flush, 1500);
    return () => clearTimeout(t);
  }, [state, flush]);
  useEffect(() => {
    const t = setInterval(flush, 15_000);
    return () => clearInterval(t);
  }, [flush]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty.current && !handedIn.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, []);

  const handIn = useCallback(() => {
    if (handedIn.current) return;
    handedIn.current = true;
    setConfirm(false);
    submit.mutate(
      { state: latest.current, focusLosses: trackFocus ? focusCount.current : undefined },
      {
        onError: () => (handedIn.current = false),
        onSuccess: () => {
          try {
            window.localStorage.removeItem(focusKey(a.id));
          } catch {
            /* ignore */
          }
        },
      },
    );
  }, [submit, trackFocus, focusCount, a.id]);

  // Time's up in a timed practical: hand in what is recorded.
  useEffect(() => {
    if (left != null && left <= 0 && !handedIn.current && !submit.isError) handIn();
  }, [left, handIn, submit.isError]);
  // A hand-in at zero that failed (usually the network) is tried again, as in an online exam.
  const { reset: resetSubmit, isError: submitFailed } = submit;
  useEffect(() => {
    if (left == null || left > 0 || !submitFailed) return;
    const t = setTimeout(resetSubmit, 5000);
    return () => clearTimeout(t);
  }, [left, submitFailed, resetSubmit]);

  const Sim = entry.component;
  const Sim3d = entry.component3d;
  const missing = done ? [] : entry.missing(state as never, a.seed, a.paper);
  // A Guided practical is a marked workflow, not a simulation, and is never called a lab here.
  const guided = isGuidedPractical(a.simulatorId);
  const word = guided ? 'practical' : 'lab';
  const lowTime = left != null && left < 5 * 60_000;
  const view = submit.data ?? a;
  // A practical test's score can show before the marks in detail: those, and the record, wait until nobody can still be sitting.
  const canReview = !view.assessment || view.assessment.review;

  if (submit.isPending) {
    return (
      <Card className="mt-6 flex flex-col items-center gap-4 p-8 text-center" role="status" aria-live="polite">
        <div className="grid size-16 place-items-center rounded-2xl bg-ai-gradient text-white">
          <Loader2 className="size-7 animate-spin" aria-hidden />
        </div>
        <div>
          <p className="font-display text-lg font-semibold tracking-tight">{left != null && left <= 0 ? `Time’s up — your ${word} has been handed in` : `Marking your ${word}`}</p>
          <p className="mt-1 text-[13.5px] text-muted-foreground">{guided ? 'Your choices and results are marked exactly' : 'Readings and calculations are marked exactly'}; written answers are checked against the marking guide.</p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={`${view.subject} · ${view.assessment ? (view.assessment.kind === 'EXAM' ? 'Practical exam' : 'Practical test') : guided ? 'Guided practical' : 'Virtual lab'}`}
        title={view.title}
        description={view.topic ?? view.spec.title}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to={view.assessment ? '/my-exams' : `/learn/practicals/lesson/${encodeURIComponent(view.practicalId)}`}>
              <ArrowLeft /> {view.assessment ? 'Exams' : 'Lesson'}
            </Link>
          </Button>
        }
      />
      {view.submittedAt && !view.result ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center" role="status">
          <div className="grid size-14 place-items-center rounded-2xl bg-success-soft text-success">
            <CheckCircle2 className="size-7" aria-hidden />
          </div>
          <p className="font-display text-lg font-semibold tracking-tight">Handed in{view.assessment ? `: ${view.assessment.title}` : ''}</p>
          <p className="max-w-md text-[13.5px] text-muted-foreground">{view.assessment?.resultNote ?? `Your ${word} has been marked.`}</p>
          <Button asChild variant="outline" size="sm">
            <Link to="/my-exams">Back to Exams</Link>
          </Button>
        </Card>
      ) : view.submittedAt ? (
        <div className="space-y-4">
          <LabResult a={view} />
          {view.assessment?.resultNote && <p className="rounded-xl bg-muted px-4 py-3 text-[13.5px]">{view.assessment.resultNote}</p>}
          {canReview && (
            <div className="flex flex-wrap gap-2">
              <Button variant={showWork === '2d' ? 'secondary' : 'outline'} onClick={() => setShowWork((s) => (s === '2d' ? null : '2d'))}>
                <Eye /> {showWork === '2d' ? 'Hide' : 'Show'} your {word} record
              </Button>
              {can3d && Sim3d && view.state && (
                <Button variant={showWork === '3d' ? 'secondary' : 'brand'} onClick={() => setShowWork((s) => (s === '3d' ? null : '3d'))}>
                  <Box /> {showWork === '3d' ? 'Close the 3D walkthrough' : 'Walk through it in 3D'}
                </Button>
              )}
            </div>
          )}
          {showWork === '2d' && view.state && (
            <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
              <Sim seed={view.seed} mode={view.mode} state={view.state as never} onChange={() => undefined} readOnly startedAt={view.startedAt} practicalId={view.practicalId} paper={view.paper} />
            </Suspense>
          )}
          {showWork === '3d' && view.state && Sim3d && (
            <Lab3DBoundary fallback={null} onError={() => setShowWork('2d')}>
              <Suspense fallback={<Skeleton className="h-[min(78dvh,780px)] min-h-[480px] rounded-2xl" />}>
                <Sim3d seed={view.seed} mode={view.mode} state={view.state as never} onChange={() => undefined} readOnly startedAt={view.startedAt} practicalId={view.practicalId} result={view.result} paper={view.paper} />
              </Suspense>
            </Lab3DBoundary>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/95 p-3 shadow-soft backdrop-blur">
            <Badge variant={a.mode === 'EXAM' ? 'warning' : 'brand'}>
              <FlaskConical /> {a.assessment ? (a.mode === 'EXAM' ? 'Practical exam — one attempt' : 'Practical test — one attempt') : a.mode === 'EXAM' ? 'Timed practical' : 'Practice — untimed'}
            </Badge>
            {left != null && (
              <span className={cn('inline-flex items-center gap-1 font-display text-[15px] font-semibold tabular', lowTime ? 'text-danger' : 'text-foreground')} aria-live="off">
                <Clock className="size-4" aria-hidden /> {clock(left)}
              </span>
            )}
            <span className="text-[12px] text-muted-foreground">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : saved === 'error' ? 'Not saved — will retry' : ''}</span>
            {can3d && (
              <div className="ml-auto inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Lab view">
                {(['3d', '2d'] as const).map((v) => (
                  <Button key={v} size="sm" variant={(v === '3d') === use3d ? 'secondary' : 'ghost'} className="h-7 px-2.5" onClick={() => chooseView(v)} aria-pressed={(v === '3d') === use3d}>
                    {v === '3d' ? <Box /> : <Square />} {v === '3d' ? (guided ? '3D room' : '3D lab') : guided ? '2D view' : '2D lab'}
                  </Button>
                ))}
              </div>
            )}
            <Button size="sm" className={cn(!can3d && 'ml-auto')} onClick={() => setConfirm(true)}>
              <Send /> Hand in
            </Button>
          </div>
          {submit.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{errorMessage(submit.error)}</p>}
          {focus.away > 0 && <AwayNotice what="practical exam" onClose={focus.clearAway} className="fixed inset-x-2 top-16 z-[100] mx-auto max-w-xl rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-[13px] text-warning shadow-soft" />}
          {(() => {
            const props = {
              seed: a.seed,
              mode: a.mode,
              state: state as never,
              onChange: (next: SimulatorStates[SimulatorId]) => {
                dirty.current = true;
                setState(next);
              },
              readOnly: false,
              startedAt: a.startedAt,
              practicalId: a.practicalId,
              attemptId: a.id,
              paper: a.paper,
            };
            const flat = (
              <LabSittingContext.Provider value={sitting ? a.assessment! : null}>
                <Suspense fallback={<Skeleton className="h-[480px] rounded-2xl" />}>
                  {/* In the 2D labs, LAB mode only adds hints and timing aids, so a class test sat in LAB mode gets them hidden here. */}
                  <Sim {...props} mode={sitting ? 'EXAM' : props.mode} />
                </Suspense>
              </LabSittingContext.Provider>
            );
            if (!use3d || !Sim3d) return flat;
            return (
              <Lab3DBoundary fallback={flat} onError={() => setUse3d(false)}>
                <Suspense fallback={<Skeleton className="h-[min(78dvh,780px)] min-h-[480px] rounded-2xl" />}>
                  <LabSittingContext.Provider value={sitting ? a.assessment! : null}>
                    <Sim3d {...props} endsAt={deviceEndsAt} onHandIn={handIn} onUse2d={() => chooseView('2d')} />
                  </LabSittingContext.Provider>
                </Suspense>
              </Lab3DBoundary>
            );
          })()}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        destructive={missing.length > 0}
        title={missing.length ? 'Hand in with work missing?' : `Hand in your ${word}?`}
        description={
          missing.length ? (
            <span className="block list-disc space-y-0.5 pl-5">
              {missing.map((m) => (
                <span key={m} className="list-item">
                  {m}
                </span>
              ))}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="size-4 text-success" aria-hidden /> Everything is recorded. It will be marked now.
            </span>
          )
        }
        confirmLabel="Hand in"
        onConfirm={handIn}
      />
    </>
  );
}

/** If the 3D view fails (no WebGL after all, a driver or memory error), the 2D lab takes over with the same work. */
class Lab3DBoundary extends Component<{ fallback: ReactNode; onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
